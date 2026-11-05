import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { resolveLanguage, i18next, getTranslator } from "../core/i18n.js";

/**
 * i18n plugin — attaches a language-resolved translator to every request.
 *
 * Resolution order:
 *   1. Explicit `Accept-Language` header
 *   2. User's preferred language (if authenticated, from JWT payload)
 *   3. Default language from config
 *
 * Usage in routes:
 *   request.t('errors:NOT_FOUND', { resource: 'Terminal' })
 *   request.lang // resolved language code, e.g. "fr"
 */
declare module "fastify" {
  interface FastifyRequest {
    lang: string;
    t: (key: string, options?: Record<string, unknown>) => string;
  }
}

export async function i18nPlugin(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request: FastifyRequest, _reply: FastifyReply) => {
    const acceptLanguage = request.headers["accept-language"];
    const userLang = (request.user as { lang?: string } | undefined)?.lang;

    const lang = resolveLanguage(acceptLanguage, userLang);

    const translator = getTranslator(lang);

    request.lang = lang;
    request.t = translator.t;

    i18next.changeLanguage(lang);
  });
}
