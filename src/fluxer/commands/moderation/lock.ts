import { EmbedBuilder, GuildChannel, OverwriteType, PermissionFlags } from '@fluxerjs/core';
import { createCommand } from '#base';
import config from '#nori/config/default.config.js';
import { Category, setDescription } from '#nori/lib/category.js';

const BOT_PERMISSIONS = ['ManageChannels', 'ManageRoles'] as const;
const USER_PERMISSIONS = ['ManageChannels'] as const;
const LOCK_PERMISSION = PermissionFlags.SendMessages;

createCommand({
  name: 'lock',
  category: Category.Moderation,
  ...setDescription.Moderation({
    'en-US': 'Locks the channel so @everyone can no longer send messages',
    'pt-BR': 'Tranca o canal para o @everyone não poder mais enviar mensagens',
    'es-ES': 'Bloquea el canal para que @everyone no pueda enviar mensajes',
  }),
  aliases: ['lockdown', 'trancar', 'fechar'],
  async run(ctx) {
    const m = ctx.t.commands.moderation.lock;
    const permissions = ctx.t.general.permissions;

    const reply = (description: string) =>
      ctx.reply({ embeds: [new EmbedBuilder().setColor(config.color).setDescription(description)] });

    const translate = (missing: readonly string[]) =>
      [...new Set(missing)]
        .map((name) => permissions.names[name as keyof typeof permissions.names] ?? name)
        .join(', ');

    const channel =
      ctx.client.channels.get(ctx.channelId) ??
      (await ctx.client.channels.fetch(ctx.channelId).catch(() => null));

    if (!(channel instanceof GuildChannel) || !channel.isTextBased()) {
      await reply(m.notTextChannel);
      return;
    }

    const guild =
      ctx.client.guilds.get(ctx.guildId) ?? (await ctx.client.guilds.fetch(ctx.guildId).catch(() => null));

    if (!guild) {
      await reply(ctx.t.general.guildOnly);
      return;
    }

    const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
    const botPermissions = me?.permissionsIn(channel);

    if (botPermissions && !botPermissions.has(PermissionFlags.Administrator)) {
      const missing = botPermissions.missing([...BOT_PERMISSIONS]);

      if (missing.length > 0) {
        await ctx.reply({ content: permissions.missing(translate(missing)) });
        return;
      }
    }

    const member = await guild.members.resolve(ctx.user.id).catch(() => null);
    const memberPermissions = member?.permissionsIn(channel);
    const isOwner = guild.ownerId === ctx.user.id;

    if (!isOwner && !memberPermissions?.has(PermissionFlags.Administrator)) {
      const missing = memberPermissions?.missing([...USER_PERMISSIONS]) ?? [...USER_PERMISSIONS];

      if (missing.length > 0) {
        await ctx.reply({ content: permissions.userMissing(translate(missing)) });
        return;
      }
    }

    const everyone = channel.permissionOverwrites.cache.get(ctx.guildId);
    const locked = everyone?.deny.has(LOCK_PERMISSION) ?? false;

    if (locked) {
      await reply(m.alreadyLocked(`<#${channel.id}>`));
      return;
    }

    try {
      await channel.permissionOverwrites.edit(ctx.guildId, {
        type: OverwriteType.Role,
        deny: [LOCK_PERMISSION],
      });
    } catch {
      await reply(m.failed);
      return;
    }

    await reply(m.locked(`<#${channel.id}>`));
  },
});
