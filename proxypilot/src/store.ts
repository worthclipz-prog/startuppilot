import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { generateFingerprint } from './fingerprint.ts';
import { proxyKey } from './proxy.ts';
import type { BrowserEngine, Profile, ProxyConfig, Settings } from './types.ts';

export const DEFAULT_SETTINGS: Settings = {
  browser: 'auto',
  executablePath: '',
  headless: false,
  maxOpenBrowsers: 20,
  launchConcurrency: 4,
  screenWidth: 1920,
  screenHeight: 1080,
  tileWindows: true,
  matchLanguageToProxy: true,
  blockWebRtcLeaks: true,
  navigationTimeoutSec: 45,
};

const ENGINES: BrowserEngine[] = ['auto', 'chromium', 'chrome', 'msedge'];

/** Profiles and settings live in plain JSON files under the data directory. */
export class Store {
  profiles: Profile[] = [];
  settings: Settings = { ...DEFAULT_SETTINGS };
  private saving: Promise<void> | null = null;
  private dirty = false;

  constructor(readonly dataDir: string) {}

  async load(): Promise<void> {
    await fs.mkdir(path.join(this.dataDir, 'browser-profiles'), { recursive: true });
    this.profiles = (await readJson<Profile[]>(this.file('profiles.json'))) ?? [];
    // A check that was running when the app stopped never finished.
    for (const p of this.profiles) if (p.proxyStatus === 'checking') p.proxyStatus = 'unchecked';
    this.settings = sanitizeSettings({ ...DEFAULT_SETTINGS, ...(await readJson<Partial<Settings>>(this.file('settings.json'))) });
  }

  get(id: string): Profile | undefined {
    return this.profiles.find((p) => p.id === id);
  }

  userDataDir(id: string): string {
    return path.join(this.dataDir, 'browser-profiles', id);
  }

  /** One profile per proxy; proxies already in the list are skipped. */
  addProfiles(proxies: ProxyConfig[]): { added: Profile[]; duplicates: number } {
    const seen = new Set(this.profiles.map((p) => proxyKey(p.proxy)));
    let next = Math.max(0, ...this.profiles.map((p) => Number(/^Profile (\d+)$/.exec(p.name)?.[1] ?? 0))) + 1;
    const added: Profile[] = [];
    let duplicates = 0;
    for (const proxy of proxies) {
      const key = proxyKey(proxy);
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);
      added.push({
        id: randomUUID().slice(0, 8),
        name: `Profile ${next++}`,
        proxy,
        fingerprint: generateFingerprint(),
        proxyStatus: 'unchecked',
        createdAt: new Date().toISOString(),
      });
    }
    this.profiles.push(...added);
    return { added, duplicates };
  }

  /** Deletes the profiles and their browser data (cookies, history, logins). Close their browsers first. */
  async removeProfiles(ids: string[]): Promise<number> {
    const doomed = new Set(ids);
    const before = this.profiles.length;
    this.profiles = this.profiles.filter((p) => !doomed.has(p.id));
    // Retries cover Windows, where a just-closed browser can hold its files for a moment.
    await Promise.all([...doomed].map((id) => fs.rm(this.userDataDir(id), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })));
    await this.saveProfiles();
    return before - this.profiles.length;
  }

  updateSettings(patch: Partial<Settings>): Settings {
    this.settings = sanitizeSettings({ ...this.settings, ...patch });
    return this.settings;
  }

  /** Coalesces bursts of saves (e.g. a bulk proxy check) into sequential atomic writes. */
  saveProfiles(): Promise<void> {
    this.dirty = true;
    this.saving ??= this.flush();
    return this.saving;
  }

  async saveSettings(): Promise<void> {
    await writeJsonAtomic(this.file('settings.json'), this.settings);
  }

  private async flush(): Promise<void> {
    try {
      while (this.dirty) {
        this.dirty = false;
        await writeJsonAtomic(this.file('profiles.json'), this.profiles);
      }
    } finally {
      this.saving = null;
    }
  }

  private file(name: string): string {
    return path.join(this.dataDir, name);
  }
}

function sanitizeSettings(s: Settings): Settings {
  const int = (v: unknown, min: number, max: number, fallback: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const d = DEFAULT_SETTINGS;
  return {
    browser: ENGINES.includes(s.browser) ? s.browser : d.browser,
    executablePath: typeof s.executablePath === 'string' ? s.executablePath.trim() : '',
    headless: Boolean(s.headless),
    maxOpenBrowsers: int(s.maxOpenBrowsers, 1, 500, d.maxOpenBrowsers),
    launchConcurrency: int(s.launchConcurrency, 1, 20, d.launchConcurrency),
    screenWidth: int(s.screenWidth, 640, 7680, d.screenWidth),
    screenHeight: int(s.screenHeight, 480, 4320, d.screenHeight),
    tileWindows: Boolean(s.tileWindows),
    matchLanguageToProxy: Boolean(s.matchLanguageToProxy),
    blockWebRtcLeaks: Boolean(s.blockWebRtcLeaks),
    navigationTimeoutSec: int(s.navigationTimeoutSec, 5, 300, d.navigationTimeoutSec),
  };
}

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new Error(`Could not read ${file}: ${(err as Error).message}`);
  }
}

async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, file);
}
