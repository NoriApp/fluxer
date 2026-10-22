import { EmbedBuilder, type Message } from '@fluxerjs/core';
import config from '#nori/config/default.config.js';
import { db } from '#nori/db/index.js';

const TERMS_URL = 'https://noribot.xyz/terms';
const PRIVACY_URL = 'https://noribot.xyz/privacy';
const TIMEOUT = 5 * 60 * 1000;
const REACTION_DELAY = 400;
const REACTION_ATTEMPTS = 3;

type LanguageOption = { code: string; name: string };

const PT_BR: LanguageOption = { code: 'pt-BR', name: 'Português (Brasil)' };
const EN_US: LanguageOption = { code: 'en-US', name: 'English (US)' };

const LANGUAGES: Record<string, LanguageOption> = {
  brazil: PT_BR,
  eua: EN_US,
};

export type TermsResult = 'accepted' | 'rejected' | 'expired';

const display = (key: string) => constants.emojis.static[key] ?? '';

const parseEmoji = (key: string) => {
  const match = /^<a?:([^:]+):(\d+)>$/.exec(display(key));
  if (!match) throw new Error(`[Nori] Invalid emoji "${key}" in constants.json`);

  return { name: match[1] as string, id: match[2] as string };
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const addReaction = async (prompt: Message, key: string) => {
  const emoji = parseEmoji(key);

  for (let attempt = 1; attempt <= REACTION_ATTEMPTS; attempt++) {
    try {
      await prompt.react(emoji);
      return;
    } catch (error) {
      if (attempt === REACTION_ATTEMPTS) {
        console.log(`[Nori] Failed to add reaction "${key}":`, error);
        return;
      }

      await sleep(REACTION_DELAY * attempt);
    }
  }
};

const embed = (title: string, description: string) =>
  new EmbedBuilder().setColor(config.color).setTitle(title).setDescription(description);

const termsEmbed = () =>
  embed(
    'Terms of Service & Privacy Policy',
    [
      'Before using Nori, you need to read and accept our Terms of Service and Privacy Policy.',
      '',
      `[Terms of Service](${TERMS_URL})`,
      `[Privacy Policy](${PRIVACY_URL})`,
      '',
      `React with ${display('accept')} to agree or ${display('reject')} to decline.`,
      'This prompt expires in 5 minutes.',
    ].join('\n'),
  );

const languageEmbed = () =>
  embed(
    'Choose your language',
    [
      'React with the flag of the language you want to use:',
      '',
      `${display('brazil')} - ${PT_BR.name}`,
      `${display('eua')} - ${EN_US.name}`,
      '',
      `React with ${display('reject')} to cancel.`,
      'This prompt expires in 5 minutes.',
    ].join('\n'),
  );

const expiredEmbed = () =>
  embed('Setup cancelled', 'This setup was automatically cancelled because you took too long to respond.');

const rejectedEmbed = () =>
  embed('Terms declined', 'You declined the terms. You will not be able to use Nori until you accept them.');

const doneEmbed = (language: string) =>
  embed('All set!', `Your language was set to **${language}**. You can now use Nori.`);

const waitForReaction = async (prompt: Message, userId: string, keys: string[]) => {
  const byId = new Map(keys.map((key) => [parseEmoji(key).id, key]));

  const collector = prompt.createReactionCollector({
    filter: (reaction, user) => user.id === userId && !!reaction.emoji.id && byId.has(reaction.emoji.id),
    max: 1,
    time: TIMEOUT,
  });

  const result = new Promise<string | null>((resolve) => {
    collector.on('collect', (reaction) => resolve(byId.get(reaction.emoji.id as string) ?? null));
    collector.on('end', () => resolve(null));
  });

  for (const key of keys) {
    await sleep(REACTION_DELAY);
    await addReaction(prompt, key);
  }

  const answer = await result;

  await prompt.removeAllReactions().catch(() => null);

  return answer;
};

export const handleTermsReply = (_message: Message) => false;

export const runTerms = async (message: Message): Promise<TermsResult> => {
  const termsPrompt = await message.reply({ embeds: [termsEmbed()] });

  const answer = await waitForReaction(termsPrompt, message.author.id, ['accept', 'reject']);

  if (answer === null) {
    await message.reply({ embeds: [expiredEmbed()] });
    return 'expired';
  }

  if (answer === 'reject') {
    await message.reply({ embeds: [rejectedEmbed()] });
    return 'rejected';
  }

  const languagePrompt = await message.reply({ embeds: [languageEmbed()] });

  const choice = await waitForReaction(languagePrompt, message.author.id, ['brazil', 'eua', 'reject']);

  if (choice === null) {
    await message.reply({ embeds: [expiredEmbed()] });
    return 'expired';
  }

  if (choice === 'reject') {
    await message.reply({ embeds: [rejectedEmbed()] });
    return 'rejected';
  }

  const language = LANGUAGES[choice] as LanguageOption;

  await db.user.findOneAndUpdate(
    { userId: message.author.id },
    { $set: { language: language.code } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await message.reply({ embeds: [doneEmbed(language.name)] });

  return 'accepted';
};
