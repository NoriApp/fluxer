export default {
  general: {
    error: '> [!CAUTION]\n> Muito obrigado por reportar este erro! Ele foi encaminhado para minha equipe de desenvolvedores.',
    guildOnly: 'Este comando só pode ser usado em servidores.',
    noPermission: 'Você não tem permissão para usar este comando.',
    mention: (prefix: string) => `Olá! Eu sou a **Nori**, um bot multifunções. Use \`${prefix}help\` para ver os comandos.`,
    terms: {
      doneTitle: 'Tudo pronto!',
      doneDescription: (language: string) =>
        `Seu idioma foi definido como **${language}**. Agora você já pode usar a Nori.`,
    },
  },
  commands: {
    music: {
      play: {
        usage: (prefix: string) => `Uso correto: \`${prefix}play <nome ou link>\``,
        playerStarting: 'O player ainda está iniciando, tente novamente em alguns segundos.',
        notInVoice: 'Você precisa estar em um canal de voz.',
        notFound: 'Nenhuma música encontrada.',
        queued: (title: string) => `**${title}** foi adicionada à fila.`,
        queuedPlaylist: (name: string, amount: number) => `Playlist **${name}** com ${amount} músicas adicionada à fila.`,
      },
      stop: {
        nothingPlaying: 'Não há nada tocando no momento.',
        notInVoice: 'Você precisa estar em um canal de voz.',
        notInSameVoice: 'Você precisa estar no mesmo canal de voz que eu.',
        stopped: 'Música parada, fila limpa e saí do canal de voz.',
      },
      nowPlaying: (title: string) => `Tocando agora: **${title}**`,
      skipped: 'Música pulada.',
      failed: (title: string) => `Não consegui tocar **${title}**.`,
    },
    utilities: {
      help: {
        title: 'Ajuda',
        notFound: (name: string) => `Comando \`${name}\` não encontrado.`,
        noDescription: 'Sem descrição.',
        otherCategory: 'Outros',
        categoryField: 'Categoria',
        aliasesField: 'Atalhos',
        footer: (prefix: string) => `Use ${prefix}help <comando> para ver os detalhes`,
      },
      ping: {
        title: 'Pong!',
        unavailable: 'n/d',
        latencyField: 'Latência',
        gateway: 'Gateway',
        api: 'API',
        message: 'Mensagem',
        footer: (username: string) => `Solicitado por ${username}`,
      },
      language: {
        current: (language: string) => `Seu idioma atual é \`${language}\`.`,
        available: (languages: string) => `Idiomas disponíveis: ${languages}`,
        changed: (language: string) => `Idioma alterado para \`${language}\`.`,
        invalid: (languages: string) => `Idioma inválido. Idiomas disponíveis: ${languages}`,
        failed: 'Não consegui alterar seu idioma agora. Tente novamente.',
      },
    },
  },
};
