/** Fake upstream proxies for tests: each one plays "the internet" for ip-api.com and site.test. */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import net from 'node:net';
import { Server } from 'proxy-chain';

export interface FakeGeo {
  ip: string;
  country: string;
  countryCode: string;
  city: string;
  timezone: string;
  lat: number;
  lon: number;
}

export interface Visit {
  host: string;
  path: string;
  acceptLanguage?: string;
}

export const GEOS: Record<string, FakeGeo> = {
  alpha: { ip: '203.0.113.10', country: 'Germany', countryCode: 'DE', city: 'Berlin', timezone: 'Europe/Berlin', lat: 52.52, lon: 13.4 },
  beta: { ip: '203.0.113.20', country: 'Japan', countryCode: 'JP', city: 'Tokyo', timezone: 'Asia/Tokyo', lat: 35.68, lon: 139.69 },
  gamma: { ip: '203.0.113.30', country: 'Brazil', countryCode: 'BR', city: 'São Paulo', timezone: 'America/Sao_Paulo', lat: -23.55, lon: -46.63 },
};

const REPORT_PAGE = `<!doctype html><title>NAME</title><script>
fetch('/report?' + new URLSearchParams({
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  lang: navigator.language,
  langs: navigator.languages.join(','),
  cores: navigator.hardwareConcurrency,
  memory: navigator.deviceMemory,
  webdriver: String(navigator.webdriver),
}));
</script>`;

function fakeInternet(name: string, url: string, headers: http.IncomingHttpHeaders, visits: Visit[]) {
  const u = new URL(url);
  visits.push({ host: u.hostname, path: u.pathname + u.search, acceptLanguage: headers['accept-language'] });
  const geo = GEOS[name];
  if (u.hostname === 'ip-api.com') {
    const body = { status: 'success', query: geo.ip, country: geo.country, countryCode: geo.countryCode, regionName: '', city: geo.city, lat: geo.lat, lon: geo.lon, timezone: geo.timezone };
    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  }
  if (u.hostname === 'site.test' && u.pathname === '/report') return { statusCode: 204, body: '' };
  if (u.hostname === 'site.test') return { statusCode: 200, headers: { 'content-type': 'text/html' }, body: REPORT_PAGE.replace('NAME', `via ${name}`) };
  return { statusCode: 404, body: 'not found' };
}

export async function startFakeHttpProxy(name: string, username: string, password: string) {
  const visits: Visit[] = [];
  const server = new Server({
    host: '127.0.0.1',
    port: 0,
    prepareRequestFunction: ({ request, username: u, password: p, isHttp }) => {
      if (u !== username || p !== password) return { requestAuthentication: true };
      // Only plain-HTTP requests are served; anything tunnelled (HTTPS) has nowhere to go.
      if (!isHttp) return { customConnectServer: refuseServer };
      return { customResponseFunction: () => fakeInternet(name, request.url!, request.headers, visits) };
    },
  });
  await server.listen();
  return { port: server.port, visits, close: () => server.close(true) };
}

// Accepts tunnelled connections and drops them immediately.
export const refuseServer = http.createServer();
refuseServer.on('connection', (socket) => socket.destroy());

/** Minimal SOCKS5 server with username/password auth that routes to a local "internet" server. */
export async function startFakeSocksProxy(name: string, username: string, password: string) {
  const visits: Visit[] = [];
  const internet = http.createServer((req, res) => {
    const reply = fakeInternet(name, `http://${req.headers.host}${req.url}`, req.headers, visits);
    res.writeHead(reply.statusCode, reply.headers);
    res.end(reply.body);
  });
  await new Promise<void>((resolve) => internet.listen(0, '127.0.0.1', resolve));
  const internetPort = (internet.address() as AddressInfo).port;

  const sockets = new Set<net.Socket>();
  const server = net.createServer((client) => {
    sockets.add(client);
    client.on('close', () => sockets.delete(client));
    client.on('error', () => {});
    client.once('data', (greeting) => {
      if (greeting[0] !== 5 || !greeting.subarray(2, 2 + greeting[1]).includes(2)) return client.end(Buffer.from([5, 0xff]));
      client.write(Buffer.from([5, 2]));
      client.once('data', (auth) => {
        const ulen = auth[1];
        const plen = auth[2 + ulen];
        const ok = auth.subarray(2, 2 + ulen).toString() === username && auth.subarray(3 + ulen, 3 + ulen + plen).toString() === password;
        client.write(Buffer.from([1, ok ? 0 : 1]));
        if (!ok) return client.end();
        client.once('data', (request) => {
          const host = request[3] === 3 ? request.subarray(5, 5 + request[4]).toString() : request.subarray(4, 8).join('.');
          const port = request.readUInt16BE(request.length - 2);
          const routed = request[1] === 1 && port === 80 && ['ip-api.com', 'site.test'].includes(host);
          if (!routed) return client.end(Buffer.from([5, 5, 0, 1, 0, 0, 0, 0, 0, 0]));
          const upstream = net.connect(internetPort, '127.0.0.1', () => {
            client.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
            client.pipe(upstream).pipe(client);
          });
          upstream.on('error', () => client.destroy());
        });
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: (server.address() as AddressInfo).port,
    visits,
    close: async () => {
      for (const s of sockets) s.destroy();
      await new Promise((r) => server.close(r));
      internet.closeAllConnections();
      await new Promise((r) => internet.close(r));
    },
  };
}
