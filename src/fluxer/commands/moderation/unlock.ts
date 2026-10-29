import { EmbedBuilder, GuildChannel, OverwriteType, PermissionFlags } from '@fluxerjs/core';
import { createCommand } from '#base';
import config from '#nori/config/default.config.js';
import { Category, setDescription } from '#nori/lib/category.js';

const BOT_PERMISSIONS = ['ManageChannels', 'ManageRoles'] as const;
const USER_PERMISSION = PermissionFlags.ManageChannels;
const LOCK_PERMISSION = PermissionFlags.SendMessages;

createCommand({
  name: 'unlock',
  category: Category.Moderation,
  ...setDescription.Moderation({
    'en-US': 'Unlocks the channel so @everyone can send messages again',
    'pt-BR': 'Destranca o canal para o @everyone poder enviar mensagens de novo',
    'es-ES': 'Desbloquea el canal para que @everyone pueda enviar mensajes de nuevo',
  }),
  aliases: ['unlockdown', 'destrancar', 'abrir'],
  async run(ctx) {
    const m = ctx.t.commands.moderation.unlock;
    const permissions = ctx.t.general.permissions;

    const reply = (description: string) =>
      ctx.reply({ embeds: [new EmbedBuilder().setColor(config.color).setDescription(description)] });

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

    if (me) {
      const missing = me.permissionsIn(channel).missing([...BOT_PERMISSIONS]);

      if (missing.length > 0) {
        const names = [...new Set(missing)].map(
          (name) => permissions.names[name as keyof typeof permissions.names] ?? name,
        );

        await ctx.reply({ content: permissions.missing(names.join(', ')) });
        return;
      }
    }

    const member = await guild.members.resolve(ctx.user.id).catch(() => null);

    if (!member?.permissionsIn(channel).has(USER_PERMISSION)) {
      await ctx.reply({ content: ctx.t.general.noPermission });
      return;
    }

    const everyone = channel.permissionOverwrites.cache.get(ctx.guildId);

    if (!everyone || !everyone.deny.has(LOCK_PERMISSION)) {
      await reply(m.notLocked(`<#${channel.id}>`));
      return;
    }

    try {
      const remainingDeny = everyone.deny.bitfield & ~LOCK_PERMISSION;
      const remainingAllow = everyone.allow.bitfield;

      if (remainingDeny === 0n && remainingAllow === 0n) {
        await channel.permissionOverwrites.delete(ctx.guildId);
      } else {
        await channel.permissionOverwrites.edit(ctx.guildId, {
          type: OverwriteType.Role,
          deny: remainingDeny,
          allow: remainingAllow,
        });
      }
    } catch {
      await reply(m.failed);
      return;
    }

    await reply(m.unlocked(`<#${channel.id}>`));
  },
});
