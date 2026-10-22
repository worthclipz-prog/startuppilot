import fs from 'node:fs/promises';
import path from 'node:path';
import type { Fingerprint } from './types.ts';

function pick<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)];
}

/** Common real-world values, weighted by repetition. Chrome caps navigator.deviceMemory at 8. */
export function generateFingerprint(): Fingerprint {
  return {
    hardwareConcurrency: pick([4, 4, 6, 8, 8, 8, 12, 16]),
    deviceMemory: pick([4, 8, 8, 8]),
  };
}

const COUNTRY_LOCALES: Record<string, string> = {
  US: 'en-US', GB: 'en-GB', CA: 'en-CA', AU: 'en-AU', NZ: 'en-NZ', IE: 'en-IE', IN: 'en-IN',
  SG: 'en-SG', PH: 'en-PH', ZA: 'en-ZA', NG: 'en-NG', KE: 'en-KE',
  DE: 'de-DE', AT: 'de-AT', CH: 'de-CH', FR: 'fr-FR', BE: 'fr-BE', LU: 'fr-LU', NL: 'nl-NL',
  ES: 'es-ES', MX: 'es-MX', AR: 'es-AR', CO: 'es-CO', CL: 'es-CL', PE: 'es-PE', VE: 'es-VE',
  IT: 'it-IT', PT: 'pt-PT', BR: 'pt-BR', PL: 'pl-PL', CZ: 'cs-CZ', SK: 'sk-SK', HU: 'hu-HU',
  RO: 'ro-RO', BG: 'bg-BG', GR: 'el-GR', HR: 'hr-HR', RS: 'sr-RS', SI: 'sl-SI', LT: 'lt-LT',
  LV: 'lv-LV', EE: 'et-EE', SE: 'sv-SE', NO: 'nb-NO', DK: 'da-DK', FI: 'fi-FI',
  RU: 'ru-RU', UA: 'uk-UA', BY: 'ru-BY', KZ: 'ru-KZ', TR: 'tr-TR', IL: 'he-IL',
  SA: 'ar-SA', AE: 'ar-AE', EG: 'ar-EG', MA: 'ar-MA', PK: 'ur-PK', BD: 'bn-BD',
  JP: 'ja-JP', KR: 'ko-KR', CN: 'zh-CN', TW: 'zh-TW', HK: 'zh-HK',
  ID: 'id-ID', MY: 'ms-MY', TH: 'th-TH', VN: 'vi-VN',
};

export function localeForCountry(countryCode?: string): string {
  return (countryCode && COUNTRY_LOCALES[countryCode.toUpperCase()]) || 'en-US';
}

/** navigator.languages the way Chrome reports it for a user who added English as a fallback. */
export function languagesFor(locale: string): string[] {
  const base = locale.split('-')[0];
  return [...new Set([locale, base, 'en-US', 'en'])];
}

/**
 * Sets the profile's preferred languages the same way Chrome's own settings page does, so the
 * Accept-Language header, navigator.languages, popups and workers all agree without any page-level
 * patching. The browser's menus stay in the computer's language.
 */
export async function writeLanguagePrefs(userDataDir: string, languages: string[]): Promise<void> {
  const file = path.join(userDataDir, 'Default', 'Preferences');
  let prefs: Record<string, any> = {};
  try {
    prefs = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    // New profile (or a corrupt file Chrome would reset anyway).
  }
  const list = languages.join(',');
  prefs.intl = { ...prefs.intl, accept_languages: list, selected_languages: list };
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(prefs));
}

/**
 * Runs in every page before the site's own scripts and reports this profile's CPU cores and RAM,
 * which no browser option covers. Kept as a string: a compiled function can reference bundler
 * helpers (e.g. esbuild's __name) that don't exist in the page.
 */
export function fingerprintInitScript(fp: Fingerprint): string {
  const values = JSON.stringify({ hardwareConcurrency: fp.hardwareConcurrency, deviceMemory: fp.deviceMemory });
  return `(() => {
  const fp = ${values};
  for (const [key, value] of Object.entries(fp)) {
    try {
      Object.defineProperty(Navigator.prototype, key, { get: () => value, configurable: true });
    } catch {
      // Property locked down; keep the real value.
    }
  }
})();`;
}
