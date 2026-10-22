export type ProxyProtocol = 'http' | 'https' | 'socks4' | 'socks5';

export interface ProxyConfig {
  protocol: ProxyProtocol;
  host: string;
  port: number;
  username?: string;
  password?: string;
}

/** Where the proxy's exit IP is, as reported by an IP-geolocation service. */
export interface GeoInfo {
  ip: string;
  country: string;
  countryCode: string;
  region?: string;
  city?: string;
  timezone: string;
  lat: number;
  lon: number;
  latencyMs: number;
  checkedAt: string;
}

/** Per-profile device traits, generated once and kept so a profile looks like the same machine every time. */
export interface Fingerprint {
  hardwareConcurrency: number;
  deviceMemory: number;
}

export type ProxyStatus = 'unchecked' | 'checking' | 'ok' | 'dead';

export interface Profile {
  id: string;
  name: string;
  proxy: ProxyConfig;
  fingerprint: Fingerprint;
  proxyStatus: ProxyStatus;
  proxyError?: string;
  geo?: GeoInfo;
  createdAt: string;
}

export type BrowserEngine = 'chromium' | 'chrome' | 'msedge';

export interface Settings {
  /** chromium = Playwright's bundled build; chrome/msedge = the copy installed on this computer. */
  browser: BrowserEngine;
  /** Overrides `browser` when set. */
  executablePath: string;
  headless: boolean;
  maxOpenBrowsers: number;
  launchConcurrency: number;
  screenWidth: number;
  screenHeight: number;
  tileWindows: boolean;
  matchLanguageToProxy: boolean;
  blockWebRtcLeaks: boolean;
  navigationTimeoutSec: number;
}

export type RunState = 'stopped' | 'launching' | 'running' | 'error';

export interface RuntimeStatus {
  state: RunState;
  error?: string;
  url?: string;
  title?: string;
}

export interface ActionResult {
  id: string;
  ok: boolean;
  error?: string;
}
