import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 4800);
const dataDir = path.resolve(process.env.PROXYPILOT_DATA_DIR ?? path.join(root, 'data'));

let server;
try {
  server = await startServer({ port, dataDir });
} catch (err) {
  if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Is ProxyPilot already running? Start on another port with PORT=${port + 1} npm start`);
    process.exit(1);
  }
  throw err;
}

console.log(`ProxyPilot control panel: ${server.url}`);
console.log(`Profiles and browser data: ${dataDir}`);
console.log('Press Ctrl+C to stop (this closes every browser it opened).');
if (process.env.NO_OPEN !== '1') openInDefaultBrowser(server.url);

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    if (stopping) process.exit(1);
    stopping = true;
    console.log('\nClosing browsers...');
    await server.close();
    process.exit(0);
  });
}

function openInDefaultBrowser(url: string): void {
  const [command, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', () => {}); // No desktop opener available; the URL is printed above.
  child.unref();
}
