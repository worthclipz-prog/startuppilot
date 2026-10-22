import { fetch, ProxyAgent } from 'undici';
import { startBridge } from './bridge.ts';
import type { GeoInfo, ProxyConfig } from './types.ts';

type GeoFields = Omit<GeoInfo, 'latencyMs' | 'checkedAt'>;

interface Provider {
  url: string;
  parse(body: any): GeoFields | null;
}

// Tried in order until one answers; free tiers rate-limit, so having fallbacks matters on big lists.
const PROVIDERS: Provider[] = [
  {
    url: 'http://ip-api.com/json/?fields=status,country,countryCode,regionName,city,lat,lon,timezone,query',
    parse: (b) =>
      b.status === 'success'
        ? { ip: b.query, country: b.country, countryCode: b.countryCode, region: b.regionName, city: b.city, timezone: b.timezone, lat: b.lat, lon: b.lon }
        : null,
  },
  {
    url: 'https://ipwho.is/',
    parse: (b) =>
      b.success
        ? { ip: b.ip, country: b.country, countryCode: b.country_code, region: b.region, city: b.city, timezone: b.timezone?.id, lat: b.latitude, lon: b.longitude }
        : null,
  },
  {
    url: 'https://ipinfo.io/json',
    parse: (b) => {
      if (!b.ip || !b.loc || !b.timezone) return null;
      const [lat, lon] = String(b.loc).split(',').map(Number);
      return { ip: b.ip, country: countryName(b.country), countryCode: b.country, region: b.region, city: b.city, timezone: b.timezone, lat, lon };
    },
  },
];

// Status codes the local bridge answers with when the upstream proxy itself is unusable.
// Any of these means the proxy is dead, so there is no point asking the next provider.
const BRIDGE_ERRORS: Record<number, string> = {
  504: 'Proxy timed out',
  593: 'Proxy host not found',
  594: 'Proxy refused the connection',
  595: 'Proxy connection reset',
  596: 'Proxy connection dropped',
  597: 'Wrong proxy username or password',
};

export class ProxyDeadError extends Error {}

/** Looks up the exit IP and its location through an already-running local bridge. */
export async function lookupGeo(bridgeUrl: string, timeoutMs = 15_000): Promise<GeoInfo> {
  // Plain-HTTP lookups are forwarded rather than tunnelled: many proxies only allow CONNECT to port 443.
  const dispatcher = new ProxyAgent({ uri: bridgeUrl, proxyTunnel: false });
  const failures: string[] = [];
  try {
    for (const provider of PROVIDERS) {
      const started = Date.now();
      try {
        const res = await fetch(provider.url, {
          dispatcher,
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (BRIDGE_ERRORS[res.status]) throw new ProxyDeadError(BRIDGE_ERRORS[res.status]);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const geo = provider.parse(await res.json());
        if (!geo?.ip || !geo.timezone) throw new Error('unexpected response');
        return { ...geo, latencyMs: Date.now() - started, checkedAt: new Date().toISOString() };
      } catch (err) {
        if (err instanceof ProxyDeadError) throw err;
        failures.push(`${new URL(provider.url).host}: ${describe(err)}`);
      }
    }
  } finally {
    await dispatcher.close();
  }
  throw new Error(`Proxy check failed (${failures.join('; ')})`);
}

export async function checkProxy(proxy: ProxyConfig): Promise<GeoInfo> {
  const bridge = await startBridge(proxy);
  try {
    return await lookupGeo(bridge.url);
  } finally {
    await bridge.close();
  }
}

function describe(err: unknown): string {
  if (err instanceof Error && err.name === 'TimeoutError') return 'timed out';
  const cause = (err as { cause?: { message?: string } })?.cause?.message;
  return cause ?? (err as Error)?.message ?? String(err);
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

function countryName(code: string): string {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}
