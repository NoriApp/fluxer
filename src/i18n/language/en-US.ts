import type ptBR from '#nori/i18n/language/pt-BR.js';

export default {
  general: {
    error: '> [!CAUTION]\n> Thank you so much for reporting this bug! It has been forwarded to my development team.',
    guildOnly: 'This command can only be used in servers.',
    noPermission: "You don't have permission to use this command.",
    mention: (prefix: string) => `Hi! I'm **Nori**, a multifunctional bot. Use \`${prefix}help\` to see my commands.`,
    terms: {
      doneTitle: 'All set!',
      doneDescription: (language: string) =>
        `Your language was set to **${language}**. You can now use Nori.`,
    },
    permissions: {
      missing: (permissions: string) =>
        `> [!WARNING]\n> I don't have enough permissions to run this command, I need the following permission(s): ${permissions}`,
      names: {
        ViewChannel: 'View Channel',
        SendMessages: 'Send Messages',
        EmbedLinks: 'Embed Links',
        AttachFiles: 'Attach Files',
        Connect: 'Connect',
        Speak: 'Speak',
      },
    },
    music: {
      player: {
        duration: (minutes: number, seconds: number) =>
          [
            minutes > 0 && `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`,
            seconds > 0 && `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`,
          ]
            .filter(Boolean)
            .join(' and '),
        queueEnded: (time: string) =>
          `The queue has ended. You have ${time} to add another song before I close the player.`,
        alone: (time: string) => `I'm alone in the call. If nobody joins within ${time}, I'll close the player.`,
      },
    },
  },
  commands: {
    music: {
      play: {
        usage: (prefix: string) => `Correct usage: \`${prefix}play <name or link>\``,
        playerStarting: 'The player is still starting, please try again in a few seconds.',
        notInVoice: 'You need to be in a voice channel.',
        notFound: 'No songs found.',
        queued: (title: string) => `**${title}** was added to the queue.`,
        queuedPlaylist: (name: string, amount: number) =>
          `Playlist **${name}** with ${amount} songs was added to the queue.`,
      },
      stop: {
        nothingPlaying: 'Nothing is playing right now.',
        notInVoice: 'You need to be in a voice channel.',
        notInSameVoice: 'You need to be in the same voice channel as me.',
        stopped: 'Playback stopped, queue cleared and I left the voice channel.',
      },
      volume: {
        nothingPlaying: 'Nothing is playing right now.',
        notInVoice: 'You need to be in a voice channel.',
        notInSameVoice: 'You need to be in the same voice channel as me.',
        invalid: (min: number, max: number) => `Enter a volume between ${min} and ${max}.`,
        current: (volume: number) => `The current volume is **${volume}%**.`,
        changed: (volume: number) => `Volume set to **${volume}%**.`,
      },
      nowPlaying: (title: string) => `Now playing: **${title}**`,
      skipped: 'Song skipped.',
      failed: (title: string) => `I couldn't play **${title}**.`,
    },
    utilities: {
      help: {
        title: 'Help',
        notFound: (name: string) => `Command \`${name}\` not found.`,
        noDescription: 'No description.',
        otherCategory: 'Other',
        categoryField: 'Category',
        aliasesField: 'Aliases',
        invite: 'Invite me!',
        footer: (prefix: string) => `Use ${prefix}help <command> to see the details`,
      },
      ping: {
        title: `${constants.emojis.static.pingpong} Pong!`,
        unavailable: 'n/a',
        latencyField: 'Latency',
        gateway: 'Gateway',
        api: 'API',
        message: 'Message',
        footer: (username: string) => `Requested by ${username}`,
      },
      node: {
        title: 'Nodes',
        unavailable: 'n/a',
        status: 'Status',
        online: 'Online',
        offline: 'Offline',
        latency: 'Latency',
        players: 'Players',
        cpu: 'CPU',
        ram: 'RAM',
        uptime: 'Uptime',
        footer: (username: string) => `Requested by ${username}`,
      },
      language: {
        current: (language: string) => `Your current language is \`${language}\`.`,
        available: (languages: string) => `Available languages: ${languages}`,
        changed: (language: string) => `Language changed to \`${language}\`.`,
        invalid: (languages: string) => `Invalid language. Available languages: ${languages}`,
        failed: "I couldn't change your language right now. Please try again.",
      },
    },
  },
} satisfies typeof ptBR;
