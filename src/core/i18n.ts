import i18next from "i18next";
import Backend from "i18next-fs-backend";
import { config } from "../config/index.js";
import { logger } from "./logger.js";

/**
 * i18n setup for PrimeStack Switch.
 * Supports en, fr, es, ar, pt out of the box.
 * New languages can be added by dropping locale files in src/locales/.
 *
 * All API error messages, notification content, and user-facing strings
 * flow through this instance. The request-language is determined by
 * the i18n Fastify plugin based on Accept-Language header or user preference.
 */
export const SUPPORTED_LANGUAGES = config.i18n.supportedLanguages;
export const DEFAULT_LANGUAGE = config.i18n.defaultLanguage;

let initialized = false;

export async function initI18n(): Promise<void> {
  if (initialized) return;

  await i18next.use(Backend).init({
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    preload: SUPPORTED_LANGUAGES,
    backend: {
      loadPath: "src/locales/{{lng}}/{{ns}}.json",
    },
    ns: ["common", "errors", "notifications"],
    defaultNS: "common",
    interpolation: {
      escapeValue: false,
    },
    returnObjects: true,
  });

  initialized = true;
  logger.info({ languages: SUPPORTED_LANGUAGES }, "i18n initialized");
}

export { i18next };

/**
 * Get a translator function for a specific language.
 * Used by the i18n plugin and notification service.
 */
export function getTranslator(lang: string = DEFAULT_LANGUAGE) {
  return {
    t: (key: string, options?: Record<string, unknown>) => {
      return i18next.t(key, { lng: lang, ...options });
    },
  };
}

/**
 * Resolve a language from the Accept-Language header or explicit preference.
 * Falls back to the default language if none of the requested languages
 * are supported.
 */
export function resolveLanguage(acceptLanguage?: string | null, preferred?: string | null): string {
  if (preferred && SUPPORTED_LANGUAGES.includes(preferred)) {
    return preferred;
  }

  if (acceptLanguage) {
    // Parse Accept-Language header: "en-US,en;q=0.9,fr;q=0.8"
    const languages = acceptLanguage
      .split(",")
      .map((l) => {
        const [tag, q] = l.trim().split(";q=");
        return { tag: tag.split("-")[0], q: q ? parseFloat(q) : 1 };
      })
      .sort((a, b) => b.q - a.q);

    for (const { tag } of languages) {
      if (SUPPORTED_LANGUAGES.includes(tag)) return tag;
    }
  }

  return DEFAULT_LANGUAGE;
}
