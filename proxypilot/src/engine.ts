import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium } from 'playwright';
import type { BrowserEngine, Settings } from './types.ts';

export type ResolvedEngine = Exclude<BrowserEngine, 'auto'> | 'custom';

// Same install locations Playwright checks for its "chrome" and "msedge" channels.
function installPaths(channel: 'chrome' | 'msedge'): string[] {
  const env = process.env;
  if (process.platform === 'win32') {
    const roots = [env.LOCALAPPDATA, env.PROGRAMFILES, env['PROGRAMFILES(X86)']].filter(Boolean) as string[];
    const exe = channel === 'chrome' ? 'Google\\Chrome\\Application\\chrome.exe' : 'Microsoft\\Edge\\Application\\msedge.exe';
    return roots.map((root) => path.win32.join(root, exe));
  }
  if (process.platform === 'darwin') {
    return channel === 'chrome'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'];
  }
  return channel === 'chrome' ? ['/opt/google/chrome/chrome'] : ['/opt/microsoft/msedge/msedge'];
}

export function isChannelInstalled(channel: 'chrome' | 'msedge'): boolean {
  return installPaths(channel).some((p) => fs.existsSync(p));
}

export function isChromiumInstalled(): boolean {
  try {
    return fs.existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

/** "Automatic" prefers a real Chrome, then Edge (preinstalled on Windows), then the downloadable Chromium. */
export function resolveEngine(settings: Settings): ResolvedEngine {
  if (settings.executablePath) return 'custom';
  if (settings.browser !== 'auto') return settings.browser;
  if (isChannelInstalled('chrome')) return 'chrome';
  if (isChannelInstalled('msedge')) return 'msedge';
  return 'chromium';
}

export function launchOptions(settings: Settings): { channel?: string; executablePath?: string } {
  const engine = resolveEngine(settings);
  if (engine === 'custom') return { executablePath: settings.executablePath };
  return engine === 'chromium' ? {} : { channel: engine };
}

export interface EngineInfo {
  resolved: ResolvedEngine;
  chromeInstalled: boolean;
  edgeInstalled: boolean;
  chromiumInstalled: boolean;
}

export function engineInfo(settings: Settings): EngineInfo {
  return {
    resolved: resolveEngine(settings),
    chromeInstalled: isChannelInstalled('chrome'),
    edgeInstalled: isChannelInstalled('msedge'),
    chromiumInstalled: isChromiumInstalled(),
  };
}

/**
 * Downloads Playwright's Chromium build (~150 MB) by running Playwright's own installer. In the
 * desktop app process.execPath is the app itself, so ELECTRON_RUN_AS_NODE makes it act as Node.
 */
export function installChromium(): Promise<void> {
  const require = createRequire(import.meta.url);
  const cli = path
    .join(path.dirname(require.resolve('playwright-core/package.json')), 'cli.js')
    // Packaged apps unpack playwright-core next to the archive so it can run as a script.
    .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  const env: NodeJS.ProcessEnv = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
  delete env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'install', 'chromium'], { env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0 && isChromiumInstalled()) return resolve();
      // Playwright prints "Error: <reason>, caused by" followed by a stack; the reason is what's useful.
      const reason = /^Error: (.+?)(, caused by)?$/m.exec(stderr)?.[1] ?? `installer exited with code ${code}`;
      reject(new Error(`Chromium download failed (${reason}). Check the internet connection and try again.`));
    });
  });
}
