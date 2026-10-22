/**
 * End-to-end test of the packaged desktop app. Build it first (`npm run dist:dir`, or `dist:win` on
 * Windows), then `npm run test:packaged`. It starts the real executable, uses its window the way a
 * person would, and checks that proxy browsers really go out through their proxies.
 *
 * PROXYPILOT_APP           path to the executable (defaults to the electron-builder --dir output)
 * PROXYPILOT_TEST_BROWSER  browser binary for the proxy windows (defaults to the app's automatic choice)
 * PROXYPILOT_TEST_HEADED=1 show the proxy browser windows instead of running them hidden
 * PROXYPILOT_SCREENSHOT    save a screenshot of the app window here
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { GEOS, refuseServer, startFakeHttpProxy, startFakeSocksProxy } from './fakes.ts';

const DEFAULT_APP: Record<string, string> = {
  win32: 'release/win-unpacked/ProxyPilot.exe',
  linux: 'release/linux-unpacked/proxypilot',
  darwin: 'release/mac/ProxyPilot.app/Contents/MacOS/ProxyPilot',
};

let app: ElectronApplication;
let panel: Page;
let dataDir: string;
let alpha: Awaited<ReturnType<typeof startFakeHttpProxy>>;
let gamma: Awaited<ReturnType<typeof startFakeSocksProxy>>;

const stats = () => panel.textContent('#stats');

before(async () => {
  alpha = await startFakeHttpProxy('alpha', 'alpha', 'pw-a');
  gamma = await startFakeSocksProxy('gamma', 'gamma', 'pw-g');
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'proxypilot-app-test-'));
  const runningAsRoot = process.platform === 'linux' && process.getuid?.() === 0;
  app = await electron.launch({
    executablePath: path.resolve(process.env.PROXYPILOT_APP ?? DEFAULT_APP[process.platform]),
    args: runningAsRoot ? ['--no-sandbox'] : [],
    env: { ...process.env, PROXYPILOT_DATA_DIR: dataDir, PROXYPILOT_PORT: '47899' },
  });
  panel = await app.firstWindow();
});

after(async () => {
  await app?.close().catch(() => {});
  await Promise.all([alpha?.close(), gamma?.close()]);
  refuseServer.close();
  await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
});

test('the app window shows the control panel', async () => {
  await panel.waitForSelector('#importBtn');
  assert.equal(await panel.title(), 'ProxyPilot');
  await panel.waitForFunction(() => document.querySelector('#conn')?.textContent === 'Engine running');
});

test('settings can be changed from the window', async () => {
  await panel.click('#settingsCard summary');
  if (process.env.PROXYPILOT_TEST_HEADED !== '1') await panel.check('input[name=headless]');
  if (process.env.PROXYPILOT_TEST_BROWSER) await panel.fill('input[name=executablePath]', process.env.PROXYPILOT_TEST_BROWSER);
  await panel.click('#settingsForm button[type=submit]');
  await panel.waitForSelector('.toast.ok');
  console.log(`  engine: ${await panel.textContent('#engineInfo')}`);
});

test('imports proxies and opens a website on each of them', async () => {
  await panel.fill(
    '#proxyText',
    [`127.0.0.1:${alpha.port}:alpha:pw-a`, `socks5://gamma:pw-g@127.0.0.1:${gamma.port}`, '127.0.0.1:1:dead:dead'].join('\n'),
  );
  await panel.click('#importBtn');
  await panel.waitForFunction(() => /Working 2.*Dead 1/s.test(document.querySelector('#stats')?.textContent ?? ''), null, { timeout: 30_000 });

  await panel.fill('#url', 'http://site.test/');
  await panel.click('#openBtn');
  await panel.waitForFunction(() => /Open 2/.test(document.querySelector('#stats')?.textContent ?? ''), null, { timeout: 90_000 });
  console.log(`  ${await stats()}`);

  for (const [name, fake] of [['alpha', alpha], ['gamma', gamma]] as const) {
    let report;
    for (let i = 0; i < 100 && !report; i++) {
      report = fake.visits.find((v) => v.path.startsWith('/report'));
      if (!report) await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(report, `${name}: the page loaded through its proxy`);
    const seen = new URLSearchParams(report.path.split('?')[1]);
    assert.equal(seen.get('tz'), GEOS[name].timezone, `${name} timezone`);
    assert.equal(seen.get('webdriver'), 'false');
  }
  if (process.env.PROXYPILOT_SCREENSHOT) await panel.screenshot({ path: process.env.PROXYPILOT_SCREENSHOT });
});

test('quitting closes the proxy browsers and exits', async () => {
  await app.close();
  const before = alpha.visits.length;
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(alpha.visits.length, before, 'no traffic after quitting');
});
