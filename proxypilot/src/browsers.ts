import { EventEmitter } from 'node:events';
import { chromium, type BrowserContext } from 'playwright';
import { startBridge, type Bridge } from './bridge.ts';
import { fingerprintInitScript, languagesFor, localeForCountry, writeLanguagePrefs } from './fingerprint.ts';
import { lookupGeo, ProxyDeadError } from './geo.ts';
import { errorMessage, mapLimit } from './util.ts';
import type { Store } from './store.ts';
import type { ActionResult, GeoInfo, Profile, RuntimeStatus, Settings } from './types.ts';

interface Session {
  context: BrowserContext;
  bridge: Bridge;
}

const MIN_WINDOW = { width: 480, height: 360 };
const CASCADE_OFFSET = 28;
const NAVIGATE_CONCURRENCY = 10;

/**
 * Owns the running browsers: one persistent Chromium context per profile, each behind its own
 * local proxy bridge. Emits `status` (id, RuntimeStatus) and `profile` (Profile) events.
 */
export class BrowserManager extends EventEmitter {
  private sessions = new Map<string, Session>();
  private launching = new Set<string>();
  private statuses = new Map<string, RuntimeStatus>();
  /** Screen tile each open window occupies, so new windows fill the gaps closed ones leave. */
  private slots = new Map<string, number>();

  constructor(private store: Store) {
    super();
  }

  status(id: string): RuntimeStatus {
    return this.statuses.get(id) ?? { state: 'stopped' };
  }

  isOpen(id: string): boolean {
    return this.sessions.has(id);
  }

  isLaunching(id: string): boolean {
    return this.launching.has(id);
  }

  openIds(): string[] {
    return [...this.sessions.keys()];
  }

  /** Launches the given profiles (skipping ones already open), optionally loading `url` in each. */
  async launchMany(ids: string[], url?: string): Promise<ActionResult[]> {
    const settings = this.store.settings;
    const todo = ids.filter((id) => !this.sessions.has(id) && !this.launching.has(id));
    const room = Math.max(0, settings.maxOpenBrowsers - this.sessions.size - this.launching.size);
    const accepted = todo.slice(0, room);
    const refused = todo.slice(room);

    for (const id of accepted) {
      this.launching.add(id);
      this.slots.set(id, this.freeSlot());
      this.setStatus(id, { state: 'launching' });
    }
    const gridSize = Math.max(...this.slots.values(), -1) + 1;

    const launched = await mapLimit(accepted, settings.launchConcurrency, async (id) => {
      try {
        await this.launchOne(id, gridSize, url);
        return { id, ok: true };
      } catch (err) {
        this.launching.delete(id);
        this.slots.delete(id);
        const error = friendlyLaunchError(err);
        this.setStatus(id, { state: 'error', error });
        return { id, ok: false, error };
      }
    });
    const limitError = `Limit of ${settings.maxOpenBrowsers} open browsers reached (change it in Settings)`;
    return [...launched, ...refused.map((id) => ({ id, ok: false, error: limitError }))];
  }

  /** Loads `url` in every given profile that is already open. */
  async openUrl(ids: string[], url: string, newTab: boolean): Promise<ActionResult[]> {
    return mapLimit(ids, NAVIGATE_CONCURRENCY, async (id) => {
      const session = this.sessions.get(id);
      if (!session) return { id, ok: false, error: this.launching.has(id) ? 'Still launching' : 'Browser is not open' };
      return this.navigate(id, session, url, newTab);
    });
  }

  async close(ids: string[]): Promise<void> {
    await Promise.all(
      ids.map(async (id) => {
        const session = this.sessions.get(id);
        if (session) await session.context.close().catch(() => this.onClosed(id, session));
      }),
    );
  }

  async closeAll(): Promise<void> {
    await this.close(this.openIds());
  }

  private async launchOne(id: string, gridSize: number, url?: string): Promise<void> {
    const profile = this.store.get(id);
    if (!profile) throw new Error('Profile no longer exists');
    const settings = this.store.settings;

    const bridge = await startBridge(profile.proxy);
    let context: BrowserContext;
    try {
      const geo = await this.refreshGeo(profile, bridge);
      const userDataDir = this.store.userDataDir(id);
      const locale = settings.matchLanguageToProxy ? localeForCountry(geo.countryCode) : 'en-US';
      await writeLanguagePrefs(userDataDir, languagesFor(locale));
      context = await chromium.launchPersistentContext(userDataDir, {
        ...engineOptions(settings),
        headless: settings.headless,
        // Playwright turns Chromium's sandbox off by default; these windows browse real sites, so keep
        // it on. Chromium refuses to start sandboxed as root on Linux, the one case left without it.
        chromiumSandbox: !(process.platform === 'linux' && process.getuid?.() === 0),
        proxy: { server: bridge.url },
        viewport: null,
        // Timezone and GPS always follow the exit IP; a mismatch is the most common giveaway.
        timezoneId: geo.timezone,
        geolocation: { latitude: geo.lat, longitude: geo.lon, accuracy: 100 },
        ignoreDefaultArgs: ['--enable-automation'],
        args: this.browserArgs(settings, this.slots.get(id) ?? 0, gridSize),
        // The app closes browsers itself on Ctrl+C so cookies and logins get saved; a hard kill can lose them.
        handleSIGINT: false,
        handleSIGTERM: false,
      });
      await context.addInitScript(fingerprintInitScript(profile.fingerprint));
      context.setDefaultNavigationTimeout(settings.navigationTimeoutSec * 1000);
    } catch (err) {
      await bridge.close();
      throw err;
    }

    const session: Session = { context, bridge };
    this.sessions.set(id, session);
    this.launching.delete(id);
    context.on('close', () => this.onClosed(id, session));
    this.setStatus(id, { state: 'running' });
    if (url) await this.navigate(id, session, url, false);
  }

  /**
   * Re-reads the exit IP on every launch so the timezone matches even when a rotating proxy has
   * moved since the last check. If only the lookup service is failing, the last known location is
   * still a better guess than nothing; if the proxy itself is down, launching is pointless.
   */
  private async refreshGeo(profile: Profile, bridge: Bridge): Promise<GeoInfo> {
    const previous = profile.geo;
    try {
      const geo = await lookupGeo(bridge.url);
      Object.assign(profile, { geo, proxyStatus: 'ok', proxyError: undefined });
      return geo;
    } catch (err) {
      if (err instanceof ProxyDeadError || !previous) {
        Object.assign(profile, { proxyStatus: 'dead', proxyError: errorMessage(err) });
        throw err;
      }
      return previous;
    } finally {
      this.emit('profile', profile);
      void this.store.saveProfiles();
    }
  }

  private async navigate(id: string, session: Session, url: string, newTab: boolean): Promise<ActionResult> {
    try {
      const pages = session.context.pages();
      const page = newTab || pages.length === 0 ? await session.context.newPage() : pages[pages.length - 1];
      if (!this.store.settings.headless) await page.bringToFront();
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      this.setStatus(id, { state: 'running', url: page.url(), title: await page.title() });
      return { id, ok: true };
    } catch (err) {
      const error = errorMessage(err);
      if (this.sessions.get(id) === session) this.setStatus(id, { state: 'running', url, error });
      return { id, ok: false, error };
    }
  }

  private onClosed(id: string, session: Session): void {
    if (this.sessions.get(id) !== session) return;
    this.sessions.delete(id);
    this.slots.delete(id);
    void session.bridge.close();
    this.setStatus(id, { state: 'stopped' });
  }

  private setStatus(id: string, status: RuntimeStatus): void {
    this.statuses.set(id, status);
    this.emit('status', id, status);
  }

  private freeSlot(): number {
    const taken = new Set(this.slots.values());
    let slot = 0;
    while (taken.has(slot)) slot++;
    return slot;
  }

  private browserArgs(settings: Settings, slot: number, gridSize: number): string[] {
    const args = ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check'];
    // Stop WebRTC from revealing the computer's real IP around the proxy.
    if (settings.blockWebRtcLeaks) args.push('--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
    if (settings.headless) {
      args.push('--window-size=1366,768');
    } else if (settings.tileWindows) {
      const r = tileRect(slot, gridSize, settings.screenWidth, settings.screenHeight);
      args.push(`--window-position=${r.x},${r.y}`, `--window-size=${r.width},${r.height}`);
    }
    return args;
  }
}

/**
 * Splits the screen into a grid big enough for `count` windows. When the tiles would be smaller
 * than a usable window, windows keep a minimum size and stack in offset layers instead.
 */
export function tileRect(slot: number, count: number, screenWidth: number, screenHeight: number) {
  const cols = Math.ceil(Math.sqrt(Math.max(1, count)));
  const rows = Math.ceil(Math.max(1, count) / cols);
  const width = Math.max(MIN_WINDOW.width, Math.floor(screenWidth / cols));
  const height = Math.max(MIN_WINDOW.height, Math.floor(screenHeight / rows));
  const fitCols = Math.max(1, Math.floor(screenWidth / width));
  const fitRows = Math.max(1, Math.floor(screenHeight / height));
  const perLayer = fitCols * fitRows;
  const index = slot % perLayer;
  const layer = Math.floor(slot / perLayer);
  const x = (index % fitCols) * width + layer * CASCADE_OFFSET;
  const y = Math.floor(index / fitCols) * height + layer * CASCADE_OFFSET;
  return {
    x: Math.min(x, Math.max(0, screenWidth - width)),
    y: Math.min(y, Math.max(0, screenHeight - height)),
    width,
    height,
  };
}

function engineOptions(settings: Settings): { channel?: string; executablePath?: string } {
  if (settings.executablePath) return { executablePath: settings.executablePath };
  return settings.browser === 'chromium' ? {} : { channel: settings.browser };
}

function friendlyLaunchError(err: unknown): string {
  const message = errorMessage(err);
  if (/Executable doesn't exist|is not found at|Chromium distribution .* is not found/i.test(message)) {
    return 'Browser not installed. Run "npx playwright install chromium", or pick another browser in Settings.';
  }
  return message;
}
