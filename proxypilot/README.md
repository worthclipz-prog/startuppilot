# ProxyPilot

Upload a list of proxies and ProxyPilot turns each one into its own isolated browser profile. You can launch them all at once, and with one click open the same website in every one of them.

## What each profile gets

| | |
|---|---|
| **Its own proxy** | HTTP, HTTPS, SOCKS4 and SOCKS5, with or without username/password (Chrome can't log in to SOCKS5 proxies by itself; ProxyPilot handles that). DNS lookups go through the proxy too. |
| **Its own browser data** | Separate cookies, logins, history and storage, kept between runs. Logging in once in a profile stays logged in. |
| **Matching timezone and location** | The proxy's exit IP is looked up on every launch. The browser's timezone and GPS location are set to match it. |
| **Matching language** | Preferred languages follow the proxy's country (e.g. a German proxy gets `de-DE, de, en-US, en`). This applies to both the `Accept-Language` header and `navigator.languages`. You can turn this off. |
| **Its own device traits** | Each profile gets a fixed number of CPU cores and amount of RAM, so the profiles don't all look like the same machine. |
| **No leaks or automation flags** | WebRTC is blocked from revealing your real IP. There's no "controlled by automated software" bar, and `navigator.webdriver` is `false`. |

## Install (Windows, macOS or Linux)

1. Install **Node.js 22 LTS** from <https://nodejs.org> (20.18 or newer works).
2. Open a terminal in this `proxypilot` folder and run:

   ```bash
   npm install
   ```

   This also downloads a private copy of Chromium (about 150 MB). If you'd rather use your installed Google Chrome or Edge, pick it later in **Settings**.

3. Start it:

   ```bash
   npm start
   ```

   The control panel opens in your normal browser at <http://127.0.0.1:4800>. Keep the terminal open while you work. **Ctrl+C** closes all the proxy browsers and stops the app.

## Using it

1. **Add proxies.** Paste them, or click **Upload .txt**. Use one proxy per line in any of these formats:

   ```text
   185.10.20.30:8080
   185.10.20.30:8080:username:password
   username:password@185.10.20.30:8080
   185.10.20.30:8080@username:password
   username:password:185.10.20.30:8080
   socks5://username:password@185.10.20.30:1080
   http://gate.provider.com:7000
   ```

   Lines without `http://` / `socks5://` use the **Type** you choose. Duplicates are skipped. Rotating "sticky session" proxies are kept as separate profiles, since the same gateway with different usernames gives different IPs. Lines starting with `#` are ignored.

2. **Test proxies.** This runs automatically after import if the box is ticked. Each row then shows the exit IP, country, city, timezone and response time. Dead proxies are marked with the reason (wrong password, refused, timed out…).

3. **Open a website on all of them.** Type an address (e.g. `example.com`) and click **Open on all**. Browsers that aren't open yet are launched, and ones that are already open load the page. Windows are tiled across your screen.

**Selecting rows** (click a row or its checkbox) limits every action to just those profiles. With nothing selected, actions apply to all profiles, and dead proxies are skipped.

## Settings

| Setting | What it does |
|---|---|
| Browser | Built-in Chromium, or your installed Google Chrome / Microsoft Edge. *Custom browser path* overrides this. |
| Max open browsers | Upper limit on windows open at the same time (default 20). Extra launches are refused with a message. |
| Launch at once | How many browsers start in parallel (default 4). Lower it if your PC struggles. |
| Screen width / height | Your screen size, used to tile windows. When there are too many to fit, windows stack in offset layers. |
| Page timeout | How long to wait for a website before reporting it as failed. |
| Browser language follows proxy country | Off = every profile uses `en-US`. |
| Block WebRTC real-IP leaks | Keep on unless a site needs direct peer-to-peer calls. |
| Hidden mode | Runs the browsers without windows. |

## How many browsers can I run?

Each open browser uses roughly 200–400 MB of RAM, more on heavy sites. As a rough guide, a 16 GB PC handles about 20–30 open windows. Set **Max open browsers** to match your machine. You can store any number of profiles; only open ones use memory.

## Good to know

- **Where data lives:** `proxypilot/data/`. `profiles.json` holds your proxy list *including passwords in plain text*, and `browser-profiles/` holds each profile's cookies. Keep this folder private. Deleting a profile in the app erases its browser data.
- **The control panel is local only.** It listens on `127.0.0.1` and refuses requests from other websites or other computers.
- **IP lookups** go through each proxy to free services (ip-api.com, with ipwho.is and ipinfo.io as fallbacks).
- **What isn't disguised:** all profiles run on your own PC, so they share its graphics card (canvas/WebGL), installed fonts and screen size. Hiding those takes deeper browser modifications, which commercial anti-detect browsers ship.
- Follow the terms of service of the sites you visit and the laws where you are.

## Troubleshooting

- **"Browser not installed"**: run `npx playwright install chromium`, or choose Google Chrome in Settings.
- **"Port 4800 is already in use"**: ProxyPilot is probably already running. To use another port: `PORT=4801 npm start` (macOS/Linux), `$env:PORT=4801; npm start` (PowerShell) or `set PORT=4801 && npm start` (cmd).
- **A proxy shows "Wrong proxy username or password"**: check the line format. With `host:port:user:pass`, the host comes first.
- **Panel says "Engine offline"**: the terminal running `npm start` was closed. Start it again; your profiles are kept.

## Development

```bash
npm test          # unit tests + end-to-end test with real (headless) Chromium and fake proxies
npm run typecheck
npm run dev       # restart on file changes
```

The end-to-end test needs no internet. It starts fake HTTP and SOCKS5 proxies that require a login and pretend to be in Germany, Japan and Brazil. It then checks that every browser goes through its own proxy and reports the right timezone, languages, CPU and RAM. Set `PROXYPILOT_TEST_BROWSER=/path/to/chrome` to test against a specific browser binary.

```
src/
  main.ts         entry point: starts the server, opens the panel, handles Ctrl+C
  server.ts       local web server: REST API + live updates (Server-Sent Events)
  browsers.ts     launches/closes browsers, opens URLs, tiles windows
  bridge.ts       per-profile local proxy that handles upstream protocols and logins
  geo.ts          exit-IP + location lookup through a proxy
  fingerprint.ts  per-profile device traits, language preferences
  proxy.ts        proxy list parsing
  store.ts        profiles + settings saved as JSON
public/           the control panel (plain HTML/CSS/JS, no build step)
```
