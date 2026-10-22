export enum Category {
  Music = 'Music',
  Utilities = 'Utilities',
  Fun = 'Fun',
  Moderation = 'Moderation',
  Config = 'Config',
}

export type Locale = 'pt-BR' | 'en-US' | 'es-ES';

export type Descriptions = Partial<Record<Locale, string>> & { 'en-US': string };

export type CategoryDescription = {
  description: string;
  descriptionLocalizations: Descriptions;
};

export const categoryLabels: Record<Category, Record<Locale, string>> = {
  [Category.Music]: {
    'pt-BR': 'Música',
    'en-US': 'Music',
    'es-ES': 'Música',
  },
  [Category.Utilities]: {
    'pt-BR': 'Utilidades',
    'en-US': 'Utilities',
    'es-ES': 'Utilidades',
  },
  [Category.Fun]: {
    'pt-BR': 'Diversão',
    'en-US': 'Fun',
    'es-ES': 'Diversión',
  },
  [Category.Moderation]: {
    'pt-BR': 'Moderação',
    'en-US': 'Moderation',
    'es-ES': 'Moderación',
  },
  [Category.Config]: {
    'pt-BR': 'Configuração',
    'en-US': 'Config',
    'es-ES': 'Configuración',
  },
};

const buildDescription = (descriptions: Descriptions): CategoryDescription => ({
  description: descriptions['en-US'],
  descriptionLocalizations: descriptions,
});

export const setDescription = Object.fromEntries(
  Object.keys(Category).map((key) => [key, buildDescription]),
) as Record<keyof typeof Category, (descriptions: Descriptions) => CategoryDescription>;

export const getCategoryLabel = (category: Category, locale: Locale = 'en-US') =>
  categoryLabels[category][locale];
