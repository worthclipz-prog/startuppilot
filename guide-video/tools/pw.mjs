// Resolve Playwright from the local node_modules, or from a global install
// (PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs) when running in a sandbox.
let mod;
try {
  mod = await import('playwright');
} catch {
  const fallback = process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs';
  mod = await import(fallback);
}
export const { chromium } = mod.default ?? mod;
