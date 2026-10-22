import type ptBR from '#nori/i18n/language/pt-BR.js';

export default {
  general: {
    error: '> [!CAUTION]\n> Thank you so much for reporting this bug! It has been forwarded to my development team.',
    guildOnly: 'This command can only be used in servers.',
    noPermission: "You don't have permission to use this command.",
    mention: (prefix: string) => `Hi! I'm **Nori**, a multifunctional bot. Use \`${prefix}help\` to see my commands.`,
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
        footer: (prefix: string) => `Use ${prefix}help <command> to see the details`,
      },
      ping: {
        title: 'Pong!',
        unavailable: 'n/a',
        latencyField: 'Latency',
        gateway: 'Gateway',
        api: 'API',
        message: 'Message',
        botField: 'Bot',
        cpu: 'CPU',
        ram: 'RAM',
        heap: 'Heap',
        uptime: 'Uptime',
        servers: 'Servers',
        nodeField: (id: string) => `Node ${id}`,
        status: 'Status',
        online: 'Online',
        offline: 'Offline',
        latency: 'Latency',
        players: 'Players',
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
