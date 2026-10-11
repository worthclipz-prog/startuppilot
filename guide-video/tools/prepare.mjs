#!/usr/bin/env node
/*
 * Prepares everything the video stage needs, from the real extension:
 *   build/popup/   the extension's real popup (HTML/CSS/JS) wired to a chrome.* stub
 *   build/fonts/   web fonts (Windows UI fonts are aliased to open equivalents)
 *   build/shots/   real chrome://extensions screenshots + element boxes
 *
 * Usage: node tools/prepare.mjs --ext /path/to/youtube-ai-assistant
 *        (the folder that contains manifest.json)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from './pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'build');

const args = process.argv.slice(2);
const extArg = args[args.indexOf('--ext') + 1];
if (!args.includes('--ext') || !extArg) {
  console.error('Usage: node tools/prepare.mjs --ext <extension folder with manifest.json>');
  process.exit(1);
}
const EXT = path.resolve(extArg);
await fs.access(path.join(EXT, 'manifest.json'));

// Chrome window geometry used by the stage (see stage/stage.css).
export const CONTENT = { width: 1920, height: 945 };

async function preparePopup() {
  const out = path.join(BUILD, 'popup');
  await fs.rm(out, { recursive: true, force: true });
  await fs.cp(path.join(EXT, 'popup'), out, { recursive: true });
  const htmlPath = path.join(out, 'popup.html');
  let html = await fs.readFile(htmlPath, 'utf8');
  html = html.replace(
    '<link rel="stylesheet" href="popup.css">',
    '<link rel="stylesheet" href="/build/fonts/fonts.css">\n  <link rel="stylesheet" href="popup.css">\n  <link rel="stylesheet" href="/stage/popup-overrides.css">'
  );
  html = html.replace('<script src="popup.js"></script>', '<script src="/stage/chrome-stub.js"></script>\n  <script src="popup.js"></script>');
  if (!html.includes('chrome-stub.js') || !html.includes('fonts.css')) {
    throw new Error('popup.html layout changed; could not inject stage hooks');
  }
  await fs.writeFile(htmlPath, html);
  console.log('popup ready');
}

async function prepareFonts() {
  const out = path.join(BUILD, 'fonts');
  await fs.mkdir(out, { recursive: true });
  const families = 'family=Inter:wght@400;500;600;700&family=Roboto:wght@400;500;700&family=Barlow:wght@400;500;600;700';
  const res = await fetch(`https://fonts.googleapis.com/css2?${families}&display=block`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' }
  });
  if (!res.ok) throw new Error(`fonts css: ${res.status}`);
  let css = await res.text();
  const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
  for (const url of urls) {
    const name = url.split('/').slice(-3).join('_');
    const file = path.join(out, name);
    try {
      await fs.access(file);
    } catch {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`font ${url}: ${r.status}`);
      await fs.writeFile(file, Buffer.from(await r.arrayBuffer()));
    }
    css = css.split(url).join(name);
  }
  // Aliases: the popup and Chrome/Windows UI ask for Windows fonts.
  const blocks = css.match(/@font-face\s*{[^}]+}/g) || [];
  const alias = (from, to) =>
    blocks.filter((b) => b.includes(`'${from}'`)).map((b) => b.replace(`'${from}'`, `'${to}'`)).join('\n');
  css += '\n' + alias('Inter', 'Segoe UI') + '\n' + alias('Inter', 'Segoe UI Variable') + '\n' + alias('Inter', 'Aptos') + '\n' + alias('Barlow', 'Bahnschrift') + '\n';
  await fs.writeFile(path.join(out, 'fonts.css'), css);
  console.log(`fonts ready (${urls.length} files)`);
}

const CHROME_LOGO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <circle cx="24" cy="24" r="22" fill="#fbbc04"/>
  <path d="M24 2a22 22 0 0 1 19.05 11H24a11 11 0 0 0-9.53 5.5L4.95 13A22 22 0 0 1 24 2z" fill="#ea4335"/>
  <path d="M4.95 13l9.52 16.5A11 11 0 0 0 24 35l-9.52 16.5" fill="none"/>
  <path d="M4.95 13 14.47 29.5A11 11 0 0 0 24 35l-9.52 10.7A22 22 0 0 1 4.95 13z" fill="#34a853"/>
  <circle cx="24" cy="24" r="10" fill="#fff"/><circle cx="24" cy="24" r="8" fill="#1a73e8"/></svg>`);

async function tidyExtensionsPage(page) {
  await page.evaluate((logo) => {
    const roots = [];
    const walk = (node) => {
      roots.push(node);
      node.querySelectorAll('*').forEach((el) => el.shadowRoot && walk(el.shadowRoot));
    };
    walk(document);
    for (const root of roots) {
      // "Your browser is managed by your organization" only exists because
      // this capture runs on a policy-managed machine; a normal user won't see it.
      root.querySelectorAll('managed-footnote, #managedMessage, .managed-message').forEach((el) => (el.style.display = 'none'));
      root.querySelectorAll('*').forEach((el) => {
        if (el.children.length === 0 && /managed/i.test(el.textContent || '') && /organization/i.test(el.parentElement?.textContent || '')) {
          let box = el;
          while (box.parentElement && box.parentElement.textContent.trim().length < 80) box = box.parentElement;
          box.style.visibility = 'hidden';
        }
      });
      // Show the Google Chrome logo instead of the Chromium one.
      root.querySelectorAll('img#product-logo').forEach((img) => {
        img.parentElement?.querySelectorAll('source').forEach((s) => s.remove());
        img.removeAttribute('srcset');
        img.src = logo;
      });
    }
  }, CHROME_LOGO);
}

async function box(page, selector) {
  const loc = page.locator(selector).first();
  if (!(await loc.count())) return null;
  const b = await loc.boundingBox();
  return b && { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
}

async function captureExtensionsPage() {
  const out = path.join(BUILD, 'shots');
  await fs.mkdir(out, { recursive: true });
  const boxes = {};

  const launch = async (withExt) => {
    const profile = path.join(BUILD, 'profile-' + (withExt ? 'ext' : 'empty'));
    await fs.rm(profile, { recursive: true, force: true });
    return chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      viewport: CONTENT,
      deviceScaleFactor: 2,
      args: withExt ? [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] : []
    });
  };

  const shoot = async (page, name) => {
    await tidyExtensionsPage(page);
    // Drop the search box's autofocus ring, like a user who just arrived.
    await page.evaluate(() => {
      let el = document.activeElement;
      while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
      el?.blur?.();
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(out, name + '.png') });
    console.log('shot', name);
  };

  // 1) Fresh Chrome, no extensions, developer mode off/on.
  {
    const ctx = await launch(false);
    const page = await ctx.newPage();
    await page.goto('chrome://extensions');
    await page.waitForTimeout(1200);
    await page.mouse.move(5, 900);
    await shoot(page, 'ext-off');
    boxes.devMode = await box(page, '#devMode');
    await page.locator('#devMode').click();
    await page.mouse.move(5, 900);
    await page.waitForTimeout(800);
    await shoot(page, 'ext-on');
    boxes.loadUnpacked = await box(page, '#loadUnpacked');
    await page.locator('#loadUnpacked').hover();
    await shoot(page, 'ext-on-hover-load');
    await ctx.close();
  }

  // 2) Extension loaded (what you see right after "Select Folder").
  {
    const ctx = await launch(true);
    const page = await ctx.newPage();
    await page.goto('chrome://extensions');
    await page.waitForTimeout(1200);
    if ((await page.locator('#devMode').getAttribute('aria-pressed')) !== 'true' && !(await page.locator('#devMode').evaluate((el) => el.checked))) await page.locator('#devMode').click();
    await page.mouse.move(5, 900);
    await page.waitForTimeout(800);
    await shoot(page, 'ext-loaded');
    boxes.card = await box(page, 'extensions-item');
    boxes.cardToggle = await box(page, 'extensions-item #enableToggle');
    await ctx.close();
  }

  await fs.writeFile(path.join(out, 'boxes.json'), JSON.stringify(boxes, null, 2));
  console.log('boxes', boxes);
  await fs.rm(path.join(BUILD, 'profile-ext'), { recursive: true, force: true });
  await fs.rm(path.join(BUILD, 'profile-empty'), { recursive: true, force: true });
}

await fs.mkdir(BUILD, { recursive: true });
await preparePopup();
await prepareFonts();
await captureExtensionsPage();
