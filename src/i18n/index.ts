import config from '#nori/config/default.config.js';
import { db } from '#nori/db/index.js';
import enUS from '#nori/i18n/language/en-US.js';
import ptBR from '#nori/i18n/language/pt-BR.js';

export type Language = typeof ptBR;

const languages: Record<string, Language> = {
  'pt-BR': ptBR,
  'en-US': enUS,
};

const fallback = languages[config.locale] ?? ptBR;

export const getLanguages = () => Object.keys(languages);

export const resolveLanguage = (locale?: string | null): Language =>
  (locale ? languages[locale] : undefined) ?? fallback;

export const getUserLocale = async (userId: string) => {
  try {
    const user = (await db.user.findOne({ userId }).select('language').lean()) as { language?: string } | null;
    return user?.language ?? config.locale;
  } catch {
    return config.locale;
  }
};

export const getLanguage = async (userId: string) => resolveLanguage(await getUserLocale(userId));

export default getLanguage;
