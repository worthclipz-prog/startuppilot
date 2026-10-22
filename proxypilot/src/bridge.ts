import { Server } from 'proxy-chain';
import { proxyToUrl } from './proxy.ts';
import type { ProxyConfig } from './types.ts';

export interface Bridge {
  /** Local, credential-free HTTP proxy URL that forwards everything to the upstream proxy. */
  url: string;
  close(): Promise<void>;
}

/**
 * Chromium can't authenticate to SOCKS proxies, so every browser talks to a credential-free local
 * bridge on 127.0.0.1 instead and the bridge handles the upstream protocol and login. The proxy
 * checker goes through the same bridge, so a passing check means the browser will connect too.
 * DNS is resolved by the upstream proxy, not locally.
 */
export async function startBridge(upstream: ProxyConfig): Promise<Bridge> {
  // The "h"/"a" SOCKS variants make the proxy resolve hostnames; plain socks5/socks4 would look
  // them up on this computer for plain-HTTP pages and leak every visited domain to the local DNS.
  const upstreamProxyUrl = proxyToUrl(upstream).replace(/^socks5:/, 'socks5h:').replace(/^socks4:/, 'socks4a:');
  const server = new Server({
    host: '127.0.0.1',
    port: 0,
    verbose: false,
    prepareRequestFunction: () => ({ upstreamProxyUrl }),
  });
  await server.listen();
  return {
    url: `http://127.0.0.1:${server.port}`,
    close: () => server.close(true),
  };
}
