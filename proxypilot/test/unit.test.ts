import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tileRect } from '../src/browsers.ts';
import { languagesFor, localeForCountry } from '../src/fingerprint.ts';
import { parseProxyLine, parseProxyList, proxyKey, proxyToUrl } from '../src/proxy.ts';
import { normalizeUrl } from '../src/util.ts';

test('parses every supported proxy line format', () => {
  const cases: [string, object][] = [
    ['1.2.3.4:8080', { protocol: 'http', host: '1.2.3.4', port: 8080 }],
    ['1.2.3.4:8080:user:pass', { protocol: 'http', host: '1.2.3.4', port: 8080, username: 'user', password: 'pass' }],
    ['user:pass@1.2.3.4:8080', { protocol: 'http', host: '1.2.3.4', port: 8080, username: 'user', password: 'pass' }],
    ['1.2.3.4:8080@user:pass', { protocol: 'http', host: '1.2.3.4', port: 8080, username: 'user', password: 'pass' }],
    ['user:1234:1.2.3.4:8080', { protocol: 'http', host: '1.2.3.4', port: 8080, username: 'user', password: '1234' }],
    ['gate.example.com:7000:john.doe:5555', { protocol: 'http', host: 'gate.example.com', port: 7000, username: 'john.doe', password: '5555' }],
    ['socks5://u:p@10.0.0.5:1080', { protocol: 'socks5', host: '10.0.0.5', port: 1080, username: 'u', password: 'p' }],
    ['socks5h://10.0.0.5:1080/', { protocol: 'socks5', host: '10.0.0.5', port: 1080 }],
    ['SOCKS5://10.0.0.5:1080:u:p', { protocol: 'socks5', host: '10.0.0.5', port: 1080, username: 'u', password: 'p' }],
    ['http://us%40er:p%3Ass@Proxy.Example.com:3128', { protocol: 'http', host: 'proxy.example.com', port: 3128, username: 'us@er', password: 'p:ss' }],
    ['1.2.3.4:8080:user:pa:ss', { protocol: 'http', host: '1.2.3.4', port: 8080, username: 'user', password: 'pa:ss' }],
    ['user:p@ss@1.2.3.4:8080', { protocol: 'http', host: '1.2.3.4', port: 8080, username: 'user', password: 'p@ss' }],
    ['[2001:db8::1]:8080', { protocol: 'http', host: '2001:db8::1', port: 8080 }],
    ['customer-abc-session-1:secret@pr.provider.io:10000', { protocol: 'http', host: 'pr.provider.io', port: 10000, username: 'customer-abc-session-1', password: 'secret' }],
  ];
  for (const [line, expected] of cases) assert.deepEqual(parseProxyLine(line), expected, line);
});

test('lines without a scheme use the chosen default protocol', () => {
  assert.equal(parseProxyLine('1.2.3.4:1080', 'socks5').protocol, 'socks5');
  assert.equal(parseProxyLine('http://1.2.3.4:1080', 'socks5').protocol, 'http');
});

test('reports unparseable lines with their line numbers and skips comments', () => {
  const { proxies, errors } = parseProxyList('# my list\n1.2.3.4:80\n\nnot a proxy\n1.2.3.4:99999\nftp://1.2.3.4:21\n5.6.7.8:3128\n');
  assert.equal(proxies.length, 2);
  assert.deepEqual(
    errors.map((e) => e.line),
    [4, 5, 6],
  );
  assert.match(errors[2].reason, /Unsupported protocol "ftp"/);
});

test('proxy URLs round-trip credentials with special characters', () => {
  const proxy = parseProxyLine('socks5://us%40er:p%3Ass@10.0.0.5:1080');
  assert.equal(proxyToUrl(proxy), 'socks5://us%40er:p%3Ass@10.0.0.5:1080');
  assert.equal(proxyToUrl(proxy, false), 'socks5://10.0.0.5:1080');
  assert.equal(proxyToUrl(parseProxyLine('[2001:db8::1]:8080')), 'http://[2001:db8::1]:8080');
});

test('same gateway with different session usernames are different proxies', () => {
  const a = parseProxyLine('user-session-1:pw@gate.io:7000');
  const b = parseProxyLine('user-session-2:pw@gate.io:7000');
  assert.notEqual(proxyKey(a), proxyKey(b));
  assert.equal(proxyKey(a), proxyKey(parseProxyLine('gate.io:7000:user-session-1:pw')));
});

test('normalizes typed website addresses', () => {
  assert.equal(normalizeUrl('example.com'), 'https://example.com/');
  assert.equal(normalizeUrl('  http://example.com/a?b=1 '), 'http://example.com/a?b=1');
  assert.throws(() => normalizeUrl(''), /Enter a website/);
  assert.throws(() => normalizeUrl('javascript://alert(1)'), /Only http/);
  assert.throws(() => normalizeUrl('file:///etc/passwd'), /Only http/);
});

test('language settings follow the proxy country', () => {
  assert.equal(localeForCountry('DE'), 'de-DE');
  assert.equal(localeForCountry('zz'), 'en-US');
  assert.deepEqual(languagesFor('de-DE'), ['de-DE', 'de', 'en-US', 'en']);
  assert.deepEqual(languagesFor('en-US'), ['en-US', 'en']);
});

test('tiles windows into a grid and stacks them when the screen is full', () => {
  assert.deepEqual(tileRect(0, 4, 1920, 1080), { x: 0, y: 0, width: 960, height: 540 });
  assert.deepEqual(tileRect(3, 4, 1920, 1080), { x: 960, y: 540, width: 960, height: 540 });
  // 40 windows can't fit at a usable size: 4x3 grid of minimum-size windows, then offset layers.
  const first = tileRect(0, 40, 1920, 1080);
  const nextLayer = tileRect(12, 40, 1920, 1080);
  assert.deepEqual([first.width, first.height], [480, 360]);
  assert.deepEqual([nextLayer.x, nextLayer.y], [28, 28]);
  for (let slot = 0; slot < 40; slot++) {
    const r = tileRect(slot, 40, 1920, 1080);
    assert.ok(r.x + r.width <= 1920 && r.y + r.height <= 1080, `slot ${slot} stays on screen`);
  }
});
