#!/usr/bin/env node
/*
 * Renders the guide video frame by frame.
 *
 *   node tools/render.mjs                         full video -> youtube-niche-filter-guide.mp4
 *   node tools/render.mjs --stills 12,40.5,88     preview PNGs -> build/stills/
 *   node tools/render.mjs --from 60 --to 90       render a section (no audio) -> build/section.mp4
 *
 * Needs: build/ prepared by tools/prepare.mjs and tools/tts.py, ffmpeg on PATH.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from './pw.mjs';
import { serve } from './server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'build');
const args = process.argv.slice(2);
const opt = (name, def) => (args.includes('--' + name) ? args[args.indexOf('--' + name) + 1] : def);
const FPS = Number(opt('fps', 30));
const stills = opt('stills', null);
const OUT = path.resolve(ROOT, opt('out', stills ? 'build/stills' : args.includes('--from') ? 'build/section.mp4' : 'youtube-niche-filter-guide.mp4'));

const run = (cmd, argv, input) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    if (input) p.stdin.end(input);
  });

const { server, origin } = await serve(ROOT);
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('pageerror:', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()));
page.on('response', (r) => r.status() >= 400 && console.error('http', r.status(), r.url()));
await page.goto(origin + '/stage/stage.html');
await page.waitForFunction(() => window.stage && (window.stage.ready || window.stage.error), null, { timeout: 60000 });
const err = await page.evaluate(() => window.stage.error);
if (err) throw new Error(err);
const info = await page.evaluate(() => window.stage.info());
console.log(`timeline: ${info.duration.toFixed(1)}s, ${info.cues.length} narration cues`);
await fs.writeFile(path.join(BUILD, 'timeline.json'), JSON.stringify(info, null, 2));

// Render one frame at time t; waits (in real time) for anything still loading.
async function frame(t) {
  let pos = await page.evaluate((tt) => window.stage.render(tt), t);
  for (let i = 0; i < 400 && (await page.evaluate(() => window.stage.busy())); i++) {
    await new Promise((r) => setTimeout(r, 15));
    pos = await page.evaluate((tt) => window.stage.render(tt), t);
  }
  await page.mouse.move(pos.x, pos.y);
}

const total = Math.ceil(info.duration * FPS);
const from = Math.floor(Number(opt('from', 0)) * FPS);
const to = Math.min(total, Math.ceil(Number(opt('to', info.duration)) * FPS));

if (stills) {
  await fs.mkdir(OUT, { recursive: true });
  const times = stills.split(',').map(Number).sort((a, b) => a - b);
  let f = 0;
  for (const ts of times) {
    const target = Math.round(ts * FPS);
    for (; f <= target; f++) await frame(f / FPS);
    const file = path.join(OUT, `still-${ts.toFixed(2).padStart(7, '0')}.png`);
    await page.screenshot({ path: file });
    console.log('still', file);
  }
} else {
  let audioArgs = [];
  const full = from === 0 && to === total;
  if (full) {
    await run('python3', ['-I', path.join(ROOT, 'tools/mix_audio.py'), path.join(BUILD, 'timeline.json'), path.join(BUILD, 'narration.wav')]);
    audioArgs = ['-i', path.join(BUILD, 'narration.wav'), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11'];
  }
  const ff = spawn(
    'ffmpeg',
    ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', ...audioArgs.slice(0, 2),
      '-map', '0:v', ...(full ? ['-map', '1:a'] : []),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart',
      ...audioArgs.slice(2), '-t', String((to - from) / FPS), OUT],
    { stdio: ['pipe', 'inherit', 'inherit'] }
  );
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))));
  const started = Date.now();
  for (let f = 0; f < to; f++) {
    await frame(f / FPS);
    if (f < from) continue;
    const buf = await page.screenshot({ type: 'jpeg', quality: 93 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % (FPS * 10) === 0) {
      const el = (Date.now() - started) / 1000;
      console.log(`frame ${f}/${to} (${(f / FPS).toFixed(0)}s)  elapsed ${el.toFixed(0)}s`);
    }
  }
  ff.stdin.end();
  await done;
  console.log('wrote', OUT);
}

const errors = await page.evaluate(() => window.stage.errors());
if (errors.length) console.error('stage errors:\n' + errors.join('\n'));
await browser.close();
server.close();
