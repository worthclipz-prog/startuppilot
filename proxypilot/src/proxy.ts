import type { ProxyConfig, ProxyProtocol } from './types.ts';

const SCHEMES: Record<string, ProxyProtocol> = {
  http: 'http',
  https: 'https',
  socks: 'socks5',
  socks4: 'socks4',
  socks4a: 'socks4',
  socks5: 'socks5',
  socks5h: 'socks5',
};

export interface ParseError {
  line: number;
  text: string;
  reason: string;
}

export interface ParseResult {
  proxies: ProxyConfig[];
  errors: ParseError[];
}

/**
 * Parses a bulk proxy list, one proxy per line. Accepted formats (scheme optional on all of them):
 *   host:port
 *   host:port:user:pass
 *   user:pass:host:port
 *   user:pass@host:port
 *   host:port@user:pass
 *   socks5://user:pass@host:port
 * Blank lines and lines starting with # are skipped.
 */
export function parseProxyList(text: string, defaultProtocol: ProxyProtocol = 'http'): ParseResult {
  const proxies: ProxyConfig[] = [];
  const errors: ParseError[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    try {
      proxies.push(parseProxyLine(line, defaultProtocol));
    } catch (err) {
      errors.push({ line: i + 1, text: line, reason: (err as Error).message });
    }
  });
  return { proxies, errors };
}

export function parseProxyLine(line: string, defaultProtocol: ProxyProtocol = 'http'): ProxyConfig {
  let rest = line.trim();
  let protocol = defaultProtocol;
  const scheme = /^([a-z0-9]+):\/\//i.exec(rest);
  if (scheme) {
    const mapped = SCHEMES[scheme[1].toLowerCase()];
    if (!mapped) throw new Error(`Unsupported protocol "${scheme[1]}"`);
    protocol = mapped;
    rest = rest.slice(scheme[0].length).replace(/\/+$/, '');
  }
  return { protocol, ...parseBare(rest) };
}

type Endpoint = { host: string; port: number };
type Credentials = { username?: string; password?: string };

function parseBare(s: string): Endpoint & Credentials {
  if (s.includes('@')) {
    // user:pass@host:port — split on the last @ since passwords may contain one.
    const last = s.lastIndexOf('@');
    const endpoint = parseEndpoint(s.slice(last + 1));
    if (endpoint) return { ...endpoint, ...parseCredentials(s.slice(0, last)) };
    // host:port@user:pass
    const first = s.indexOf('@');
    const reversed = parseEndpoint(s.slice(0, first));
    if (reversed) return { ...reversed, ...parseCredentials(s.slice(first + 1)) };
    throw new Error('Could not find host:port');
  }

  const ipv6 = /^(\[[^\]]+\]:\d+)(?::(.*))?$/.exec(s);
  if (ipv6) {
    const endpoint = parseEndpoint(ipv6[1]);
    if (!endpoint) throw new Error('Invalid IPv6 address or port');
    return { ...endpoint, ...(ipv6[2] ? parseCredentials(ipv6[2]) : {}) };
  }

  const parts = s.split(':');
  if (parts.length === 2) {
    const endpoint = parseEndpoint(s);
    if (!endpoint) throw new Error('Invalid host or port');
    return endpoint;
  }
  if (parts.length >= 4) {
    // host:port:user:pass is the common provider format (the password may itself contain ':').
    // user:pass:host:port wins only when the dotted host sits at the end, e.g. user:1234:1.2.3.4:8080.
    const hostFirst = parseEndpoint(`${parts[0]}:${parts[1]}`);
    const hostLast = parts.length === 4 ? parseEndpoint(`${parts[2]}:${parts[3]}`) : null;
    const preferLast = hostLast && parts[2].includes('.') && !parts[0].includes('.');
    if (hostFirst && !preferLast) return { ...hostFirst, ...parseCredentials(parts.slice(2).join(':')) };
    if (hostLast) return { ...hostLast, ...parseCredentials(`${parts[0]}:${parts[1]}`) };
  }
  throw new Error('Unrecognized format (expected host:port, host:port:user:pass or user:pass@host:port)');
}

function parseEndpoint(s: string): Endpoint | null {
  const m = /^\[([0-9a-f:.]+)\]:(\d{1,5})$/i.exec(s) ?? /^([a-z0-9.-]+):(\d{1,5})$/i.exec(s);
  if (!m) return null;
  const port = Number(m[2]);
  if (port < 1 || port > 65535) return null;
  return { host: m[1].toLowerCase(), port };
}

function parseCredentials(s: string): Credentials {
  const colon = s.indexOf(':');
  const username = decode(colon === -1 ? s : s.slice(0, colon));
  const password = colon === -1 ? undefined : decode(s.slice(colon + 1));
  if (!username) throw new Error('Empty proxy username');
  return password === undefined ? { username } : { username, password };
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function proxyToUrl(p: ProxyConfig, includeAuth = true): string {
  const host = p.host.includes(':') ? `[${p.host}]` : p.host;
  const auth =
    includeAuth && p.username
      ? `${encodeURIComponent(p.username)}${p.password !== undefined ? `:${encodeURIComponent(p.password)}` : ''}@`
      : '';
  return `${p.protocol}://${auth}${host}:${p.port}`;
}

/** Identity used to skip duplicates on import. Credentials are part of it because rotating
 *  providers hand out one gateway host:port and pick the exit IP from the username. */
export function proxyKey(p: ProxyConfig): string {
  return [p.protocol, p.host.toLowerCase(), p.port, p.username ?? '', p.password ?? ''].join('|');
}
