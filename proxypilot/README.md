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

## Install on Windows (desktop app)

1. Download **`ProxyPilot-Setup-<version>.exe`**. Every push to this repository builds it on a Windows machine: open the repository's **Actions** tab, pick the latest green **ProxyPilot desktop** run, and download **ProxyPilot-Setup-windows** under *Artifacts* (it arrives as a zip containing the `.exe`).
2. Run it. The installer isn't code-signed, so Windows SmartScreen may say *"Windows protected your PC"*. Click **More info → Run anyway**.
3. Choose where to install (no administrator rights needed). This creates Start menu and desktop shortcuts. Open **ProxyPilot** from either.

The proxy browsers open in **Google Chrome** if it's installed, otherwise in **Microsoft Edge**, which comes with Windows, so there's nothing else to install. You can change this in **Settings**. You can also download a separate built-in Chromium from there.

Closing the ProxyPilot window closes all its proxy browsers; it asks first if any are open. Profiles, cookies and settings are kept in `%APPDATA%\ProxyPilot\data`. Uninstalling (Settings → Apps) leaves them there, so reinstalling picks them up; delete that folder to remove them for good.

## Or run from source (Windows, macOS or Linux)

1. Install **Node.js 22 LTS** from <https://nodejs.org> (20.18 or newer works).
2. Open a terminal in this `proxypilot` folder and run:

   ```bash
   npm install
   ```

   This also downloads a private copy of Chromium (about 150 MB), used when Chrome and Edge aren't installed.

3. Start it, either as a desktop window or in your normal browser:

   ```bash
   npm run desktop   # desktop window (same as the installed app)
   npm start         # control panel at http://127.0.0.1:4800 in your normal browser
   ```

   With `npm start`, keep the terminal open while you work. **Ctrl+C** closes all the proxy browsers and stops the app.

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
| Browser | *Automatic* uses Google Chrome if installed, else Microsoft Edge, else the built-in Chromium (with a **Download** button if it's missing). Or pick one. *Custom browser path* overrides this. |
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

- **Where data lives:** `%APPDATA%\ProxyPilot\data` for the desktop app, `proxypilot/data/` when run from source. `profiles.json` holds your proxy list *including passwords in plain text*, and `browser-profiles/` holds each profile's cookies. Keep this folder private. Deleting a profile in the app erases its browser data.
- **The control panel is local only.** It listens on `127.0.0.1` and refuses requests from other websites or other computers.
- **Page titles in the table aren't links** on purpose. Opening a site in the panel would load it through your real connection.
- **IP lookups** go through each proxy to free services (ip-api.com, with ipwho.is and ipinfo.io as fallbacks).
- **What isn't disguised:** all profiles run on your own PC, so they share its graphics card (canvas/WebGL), installed fonts and screen size. Hiding those takes deeper browser modifications, which commercial anti-detect browsers ship.
- Follow the terms of service of the sites you visit and the laws where you are.

## Troubleshooting

- **"Built-in Chromium is not downloaded yet"**: open **Settings** and click **Download built-in Chromium**, or pick Chrome or Edge.
- **"Google Chrome is not installed"**: choose *Automatic* or *Microsoft Edge* in Settings.
- **"Port 4800 is already in use"**: ProxyPilot is probably already running. To use another port: `PORT=4801 npm start` (macOS/Linux), `$env:PORT=4801; npm start` (PowerShell) or `set PORT=4801 && npm start` (cmd).
- **A proxy shows "Wrong proxy username or password"**: check the line format. With `host:port:user:pass`, the host comes first.
- **Panel says "Engine offline"**: the app (or the terminal running `npm start`) was closed. Start it again; your profiles are kept.

## Development

```bash
npm test               # unit tests + end-to-end test with real (headless) Chrome/Chromium and fake proxies
npm run typecheck
npm run dev            # web panel, restarts on file changes
npm run desktop        # desktop window from source
npm run dist:win       # build release/ProxyPilot-Setup-<version>.exe (run on Windows; elsewhere needs Wine)
npm run dist:dir       # unpacked app for the current OS in release/
npm run test:packaged  # drive the built app's window end to end (after dist:win or dist:dir)
```

The **ProxyPilot desktop** GitHub Actions workflow (`.github/workflows/proxypilot-desktop.yml`) runs on every push that touches `proxypilot/`. It uses a Windows machine to typecheck, run the tests with real Chrome, build the installer, and run the packaged-app test with visible browser windows. It then uploads the installer.

The end-to-end test needs no internet. It starts fake HTTP and SOCKS5 proxies that require a login and pretend to be in Germany, Japan and Brazil. It then checks that every browser goes through its own proxy and reports the right timezone, languages, CPU and RAM. Set `PROXYPILOT_TEST_BROWSER=/path/to/chrome` to test against a specific browser binary.

```
desktop/
  main.ts         desktop app: runs the engine, shows the panel in a window, asks before quitting
  build.mjs       bundles the desktop app's code for packaging
  assets/         app icon
src/
  main.ts         entry point for `npm start`: starts the server, opens the panel, handles Ctrl+C
  server.ts       local web server: REST API + live updates (Server-Sent Events)
  browsers.ts     launches/closes browsers, opens URLs, tiles windows
  engine.ts       picks Chrome / Edge / built-in Chromium, downloads Chromium
  bridge.ts       per-profile local proxy that handles upstream protocols and logins
  geo.ts          exit-IP + location lookup through a proxy
  fingerprint.ts  per-profile device traits, language preferences
  proxy.ts        proxy list parsing
  store.ts        profiles + settings saved as JSON
public/           the control panel (plain HTML/CSS/JS, no build step)
```
