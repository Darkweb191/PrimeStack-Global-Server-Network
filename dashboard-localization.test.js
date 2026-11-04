import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  DASHBOARD_TRANSLATIONS,
  SUPPORTED_DASHBOARD_LANGUAGES,
  dashboardLocalizationScript,
} from './dashboard-localization.js';

const expectedLanguageCodes = SUPPORTED_DASHBOARD_LANGUAGES.map(({ code }) => code);

describe('dashboard localization', () => {
  it('exposes 30 dashboard languages including Spanish and French', () => {
    expect(SUPPORTED_DASHBOARD_LANGUAGES).toHaveLength(30);
    expect(expectedLanguageCodes).toContain('fr');
    expect(expectedLanguageCodes).toContain('es');
  });

  it('provides a non-empty static translation or English fallback for every catalog phrase', () => {
    for (const [phrase, translations] of Object.entries(DASHBOARD_TRANSLATIONS)) {
      expect(Object.keys(translations), phrase).toEqual(expectedLanguageCodes);
      for (const code of expectedLanguageCodes) {
        expect(typeof translations[code], `${phrase} (${code})`).toBe('string');
        expect(translations[code].trim(), `${phrase} (${code})`).not.toBe('');
      }
    }
  });

  it('includes Spanish translations for standalone dashboard copy and dynamic status text', () => {
    expect(DASHBOARD_TRANSLATIONS['Quick Links'].es).toBe('Enlaces rápidos');
    expect(DASHBOARD_TRANSLATIONS['Online Services'].es).toBe('Servicios en línea');
    expect(DASHBOARD_TRANSLATIONS['Checking...'].es).toBe('Comprobando...');
    expect(DASHBOARD_TRANSLATIONS.connected.es).toBe('conectados');
    expect(DASHBOARD_TRANSLATIONS['Platform Overview'].es).toBe('Resumen de la plataforma');
    expect(DASHBOARD_TRANSLATIONS['Operations Dashboard'].es).toBe('Panel de operaciones');
    expect(DASHBOARD_TRANSLATIONS.Online.fr).toBe('En ligne');
  });

  it('builds a self-contained browser script with persistence, dynamic DOM handling, and RTL support', () => {
    const script = dashboardLocalizationScript();
    const body = script.match(/^<script>([\s\S]*)<\/script>$/);
    expect(body, 'localization output is a script tag').not.toBeNull();
    if (!body) throw new Error('Localization output is not a script tag');
    expect(() => new Function(body[1])).not.toThrow();
    expect(script).toMatch(/primestack-dashboard-language/);
    expect(script).toMatch(/MutationObserver/);
    expect(script).toMatch(/catalog\.rtl/);
    expect(script).toMatch(/toLocaleUpperCase/);
    expect(script).toContain('titleSource.split(/(\\s[—–-]\\s)/)');
    expect(script).not.toMatch(/\bfetch\s*\(/);
  });

  it('loads localization on both standalone dashboard pages', async () => {
    for (const file of ['dashboard.html', 'admin-dashboard.html']) {
      const html = await readFile(new URL(`./${file}`, import.meta.url), 'utf8');
      expect(html, file).toContain("import { dashboardLocalizationScript }");
      expect(html, file).toContain('document.body.appendChild(localization)');
    }
  });
});
