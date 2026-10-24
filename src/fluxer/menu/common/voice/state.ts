import { Events } from '@fluxerjs/core';
import { createEvent } from '#base';
import { refreshAlone } from '#nori/structures/manager/lavalink.js';

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

    refreshAlone(data.guild_id, { userId: data.user_id, channelId: data.channel_id });
  },
});
