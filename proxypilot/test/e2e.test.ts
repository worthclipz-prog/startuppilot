/**
 * Drives the real server and real Chromium windows (headless) through fake upstream proxies:
 * two HTTP proxies and one SOCKS5 proxy, all requiring a login. Each fake proxy plays "the
 * internet" for two hosts: ip-api.com (reporting a different country per proxy) and site.test,
 * whose page reports back what the browser looks like from the inside.
 *
 * Set PROXYPILOT_TEST_BROWSER to a Chromium/Chrome binary to use something other than
 * Playwright's bundled Chromium.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startServer, type RunningServer } from '../src/server.ts';
import { GEOS, refuseServer, startFakeHttpProxy, startFakeSocksProxy } from './fakes.ts';

async function waitFor<T>(label: string, fn: () => T | Promise<T>, timeoutMs = 30_000): Promise<NonNullable<T>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value as NonNullable<T>;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

let app: RunningServer;
let dataDir: string;
const proxies: Record<string, Awaited<ReturnType<typeof startFakeHttpProxy>>> = {};

async function call(method: string, route: string, body?: unknown) {
  const res = await fetch(app.url + route, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as any };
}

const profiles = async () => (await call('GET', '/api/state')).body.profiles as any[];
const byName = async (name: string) => (await profiles()).find((p) => p.proxy.username === name);

before(async () => {
  proxies.alpha = await startFakeHttpProxy('alpha', 'alpha', 'pw-a');
  proxies.beta = await startFakeHttpProxy('beta', 'beta', 'p:w@b');
  proxies.gamma = await startFakeSocksProxy('gamma', 'gamma', 'pw-g');
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'proxypilot-test-'));
  app = await startServer({ port: 0, dataDir });
  const settings = await call('PUT', '/api/settings', {
    headless: true,
    executablePath: process.env.PROXYPILOT_TEST_BROWSER ?? '',
    maxOpenBrowsers: 10,
  });
  assert.equal(settings.status, 200);
});

after(async () => {
  await app?.close();
  await Promise.all(Object.values(proxies).map((p) => p.close()));
  refuseServer.close();
  await fs.rm(dataDir, { recursive: true, force: true });
});

test('imports a mixed proxy list', async () => {
  const text = [
    `127.0.0.1:${proxies.alpha.port}:alpha:pw-a`,
    `beta:p%3Aw%40b@127.0.0.1:${proxies.beta.port}`,
    `socks5://127.0.0.1:${proxies.gamma.port}:gamma:pw-g`,
    '127.0.0.1:1:dead:dead',
    `127.0.0.1:${proxies.alpha.port}:alpha:pw-a`,
    'this is not a proxy',
  ].join('\n');
  const { body } = await call('POST', '/api/proxies/import', { text, protocol: 'http' });
  assert.equal(body.added, 4);
  assert.equal(body.duplicates, 1);
  assert.equal(body.errorCount, 1);
  const list = await profiles();
  assert.equal(list.length, 4);
  assert.ok(list.every((p) => p.proxy.password === undefined && p.proxy.hasPassword), 'passwords are never sent to the panel');
});

test('proxy check finds each exit country and flags the dead proxy', async () => {
  await call('POST', '/api/proxies/check', {});
  const list = await waitFor('proxy checks', async () => {
    const all = await profiles();
    return all.every((p) => p.proxyStatus === 'ok' || p.proxyStatus === 'dead') ? all : null;
  });
  for (const name of ['alpha', 'beta', 'gamma']) {
    const p = list.find((x) => x.proxy.username === name);
    assert.equal(p.proxyStatus, 'ok', `${name}: ${p.proxyError}`);
    assert.equal(p.geo.timezone, GEOS[name].timezone);
    assert.equal(p.geo.ip, GEOS[name].ip);
  }
  const dead = list.find((x) => x.proxy.username === 'dead');
  assert.equal(dead.proxyStatus, 'dead');
  assert.match(dead.proxyError, /refused/);
});

test('opens a website on every working proxy, each with its own identity', async () => {
  const { body } = await call('POST', '/api/browsers/open-url', { url: 'http://site.test/' });
  assert.equal(body.results.length, 3, 'dead proxy is skipped');
  for (const r of body.results) assert.ok(r.ok, r.error);

  const expectedLanguage: Record<string, string> = { alpha: 'de-DE', beta: 'ja-JP', gamma: 'pt-BR' };
  for (const name of ['alpha', 'beta', 'gamma']) {
    const fake = proxies[name];
    const report = await waitFor(`${name} page report`, () => fake.visits.find((v) => v.path.startsWith('/report')));
    const seen = Object.fromEntries(new URLSearchParams(report.path.split('?')[1]));
    const profile = await byName(name);
    assert.equal(seen.tz, GEOS[name].timezone, `${name} timezone`);
    assert.equal(seen.lang, expectedLanguage[name], `${name} language`);
    assert.equal(seen.langs, `${expectedLanguage[name]},${expectedLanguage[name].split('-')[0]},en-US,en`);
    assert.equal(Number(seen.cores), profile.fingerprint.hardwareConcurrency);
    assert.equal(Number(seen.memory), profile.fingerprint.deviceMemory);
    assert.equal(seen.webdriver, 'false');
    const page = fake.visits.find((v) => v.host === 'site.test' && v.path === '/');
    assert.equal(page!.acceptLanguage, `${expectedLanguage[name]},${expectedLanguage[name].split('-')[0]};q=0.9,en-US;q=0.8,en;q=0.7`);
    assert.equal(profile.run.state, 'running');
    assert.equal(profile.run.title, `via ${name}`);
  }
});

test('opening another page reuses the open browsers', async () => {
  const before = proxies.alpha.visits.length;
  const { body } = await call('POST', '/api/browsers/open-url', { url: 'http://site.test/again', newTab: true });
  assert.equal(body.results.length, 3);
  assert.ok(body.results.every((r: any) => r.ok));
  await waitFor('second page', () => proxies.alpha.visits.slice(before).some((v) => v.path === '/again'));
  // No new geo lookup means no relaunch.
  assert.ok(!proxies.alpha.visits.slice(before).some((v) => v.host === 'ip-api.com'));
});

test('closes everything, then respects the open-browser limit', async () => {
  await call('POST', '/api/browsers/close', {});
  assert.ok((await profiles()).every((p) => p.run.state === 'stopped'));

  await call('PUT', '/api/settings', { maxOpenBrowsers: 2 });
  const { body } = await call('POST', '/api/browsers/launch', {});
  assert.equal(body.results.filter((r: any) => r.ok).length, 2);
  assert.match(body.results.find((r: any) => !r.ok).error, /Limit of 2 open browsers/);
  await call('POST', '/api/browsers/close', {});
});

test('refuses requests that did not come from the control panel', async () => {
  const form = await fetch(`${app.url}/api/browsers/close`, { method: 'POST', body: 'x=1', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(form.status, 415);
  const foreign = await fetch(`${app.url}/api/state`, { headers: { origin: 'https://evil.example' } });
  assert.equal(foreign.status, 403);
  const rebind = await new Promise<number>((resolve, reject) => {
    const req = http.get(`${app.url}/api/state`, { headers: { host: 'evil.example:4800' } }, (res) => resolve(res.statusCode!));
    req.on('error', reject);
  });
  assert.equal(rebind, 403);
});

test('deleting a profile removes its browser data', async () => {
  const dead = await byName('dead');
  const { body } = await call('POST', '/api/profiles/delete', { ids: [dead.id] });
  assert.equal(body.removed, 1);
  assert.equal((await profiles()).length, 3);
  const alpha = await byName('alpha');
  await call('POST', '/api/profiles/delete', { ids: [alpha.id] });
  await assert.rejects(fs.stat(path.join(dataDir, 'browser-profiles', alpha.id)));
});
