import { Events } from '@fluxerjs/core';
import { client, createEvent } from '#base';
import { handleBotRemoved, refreshAlone } from '#nori/structures/manager/lavalink.js';

type VoiceStateData = {
  guild_id?: string | null;
  user_id: string;
  channel_id: string | null;
};

createEvent({
  name: 'voiceStateUpdate',
  event: Events.VoiceStateUpdate,
  run(data: VoiceStateData) {
    if (!data.guild_id) return;

    if (data.user_id === client.user?.id && !data.channel_id) {
      handleBotRemoved(data.guild_id);
      return;
    }

    refreshAlone(data.guild_id, { userId: data.user_id, channelId: data.channel_id });
  },
});
