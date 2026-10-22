import express, { type NextFunction, type Request, type Response } from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserManager } from './browsers.ts';
import { checkProxy } from './geo.ts';
import { parseProxyList } from './proxy.ts';
import { Store } from './store.ts';
import type { Profile, ProxyProtocol } from './types.ts';
import { errorMessage, HttpError, mapLimit, normalizeUrl } from './util.ts';

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const PROTOCOLS: ProxyProtocol[] = ['http', 'https', 'socks4', 'socks5'];
const CHECK_CONCURRENCY = 10;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

export interface RunningServer {
  url: string;
  store: Store;
  manager: BrowserManager;
  close(): Promise<void>;
}

export async function startServer(options: { port: number; dataDir: string }): Promise<RunningServer> {
  const store = new Store(options.dataDir);
  await store.load();
  const manager = new BrowserManager(store);

  const clients = new Set<Response>();
  const broadcast = (event: string, data: unknown) => {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) client.write(message);
  };
  const view = (p: Profile) => ({ ...publicProfile(p), run: manager.status(p.id) });
  const sendProfiles = () => broadcast('profiles', store.profiles.map(view));
  manager.on('status', (id: string, status) => broadcast('status', { id, status }));
  manager.on('profile', (p: Profile) => broadcast('profile', view(p)));

  /** Explicit ids from the request, or every profile (skipping dead proxies unless asked). */
  const targetIds = (raw: unknown, includeDead = false): string[] => {
    if (Array.isArray(raw)) return raw.filter((id): id is string => typeof id === 'string' && !!store.get(id));
    return store.profiles.filter((p) => includeDead || p.proxyStatus !== 'dead').map((p) => p.id);
  };

  const checkProfiles = async (ids: string[]) => {
    const profiles = ids.map((id) => store.get(id)).filter((p): p is Profile => !!p && p.proxyStatus !== 'checking');
    for (const p of profiles) {
      Object.assign(p, { proxyStatus: 'checking', proxyError: undefined });
      broadcast('profile', view(p));
    }
    await mapLimit(profiles, CHECK_CONCURRENCY, async (p) => {
      try {
        Object.assign(p, { geo: await checkProxy(p.proxy), proxyStatus: 'ok' });
      } catch (err) {
        Object.assign(p, { proxyStatus: 'dead', proxyError: errorMessage(err) });
      }
      broadcast('profile', view(p));
      void store.saveProfiles();
    });
  };

  const app = express();
  app.disable('x-powered-by');
  app.use(localOnly);
  app.use(express.json({ limit: '20mb' }));
  app.use(express.static(PUBLIC_DIR));

  app.get('/api/state', (_req, res) => {
    res.json({ settings: store.settings, profiles: store.profiles.map(view) });
  });

  app.get('/api/events', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    res.write('retry: 2000\n\n');
    clients.add(res);
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(keepAlive);
      clients.delete(res);
    });
  });

  app.post('/api/proxies/import', async (req, res) => {
    const protocol = PROTOCOLS.includes(req.body?.protocol) ? req.body.protocol : 'http';
    const { proxies, errors } = parseProxyList(String(req.body?.text ?? ''), protocol);
    const { added, duplicates } = store.addProfiles(proxies);
    await store.saveProfiles();
    sendProfiles();
    res.json({ added: added.length, duplicates, errors: errors.slice(0, 20), errorCount: errors.length });
    if (req.body?.check && added.length) void checkProfiles(added.map((p) => p.id));
  });

  app.post('/api/proxies/check', (req, res) => {
    const ids = targetIds(req.body?.ids, true);
    void checkProfiles(ids);
    res.json({ started: ids.length });
  });

  app.post('/api/profiles/delete', async (req, res) => {
    const ids = targetIds(req.body?.ids, true);
    const deletable = ids.filter((id) => !manager.isLaunching(id));
    await manager.close(deletable);
    const removed = await store.removeProfiles(deletable);
    sendProfiles();
    res.json({ removed, skipped: ids.length - deletable.length });
  });

  app.post('/api/browsers/launch', async (req, res) => {
    const url = req.body?.url ? normalizeUrl(req.body.url) : undefined;
    res.json({ results: await manager.launchMany(targetIds(req.body?.ids), url) });
  });

  /** The main action: open a website on every profile, launching any browser that isn't open yet. */
  app.post('/api/browsers/open-url', async (req, res) => {
    const url = normalizeUrl(req.body?.url);
    const ids = targetIds(req.body?.ids);
    const launchClosed = req.body?.launchClosed !== false;
    const open = ids.filter((id) => manager.isOpen(id));
    const closed = launchClosed ? ids.filter((id) => !manager.isOpen(id) && !manager.isLaunching(id)) : [];
    const [navigated, launched] = await Promise.all([
      manager.openUrl(open, url, Boolean(req.body?.newTab)),
      manager.launchMany(closed, url),
    ]);
    res.json({ url, results: [...navigated, ...launched] });
  });

  app.post('/api/browsers/close', async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? targetIds(req.body.ids) : manager.openIds();
    await manager.close(ids);
    res.json({ closed: ids.length });
  });

  app.put('/api/settings', async (req, res) => {
    const settings = store.updateSettings(req.body ?? {});
    await store.saveSettings();
    broadcast('settings', settings);
    res.json(settings);
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof HttpError ? err.status : ((err as { status?: number }).status ?? 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: errorMessage(err) });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    store,
    manager,
    async close() {
      for (const client of clients) client.end();
      await manager.closeAll();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** The control panel is only for this computer: refuse other hosts (DNS rebinding) and other sites' pages. */
function localOnly(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (!LOCAL_HOST.test(req.headers.host ?? '') || (origin && !LOCAL_ORIGIN.test(origin))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  // Requiring JSON forces a CORS preflight, which this server never approves, for cross-site posts.
  if (req.method !== 'GET' && req.method !== 'HEAD' && !req.is('application/json')) {
    res.status(415).json({ error: 'Expected a JSON body' });
    return;
  }
  next();
}

/** Profiles as sent to the control panel: proxy passwords never leave the server. */
function publicProfile(p: Profile) {
  const { password, ...proxy } = p.proxy;
  return { ...p, proxy: { ...proxy, hasPassword: password !== undefined } };
}
