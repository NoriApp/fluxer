export default {
  general: {
    error: '> [!CAUTION]\n> Muito obrigado por reportar este erro! Ele foi encaminhado para minha equipe de desenvolvedores.',
    guildOnly: 'Este comando só pode ser usado em servidores.',
    noPermission: 'Você não tem permissão para usar este comando.',
    blacklisted: (reason: string | null, scope: string | null, remaining: string | null) =>
      `${constants.emojis.static.barred} Você está na blacklist e não pode usar ${scope ? `os comandos de **${scope}**` : 'meus comandos'}.${reason ? `\nMotivo: ${reason}` : ''}${remaining ? `\nExpira em: ${remaining}` : ''}`,
    mention: (prefix: string) => `Olá! Eu sou a **Nori**, um bot multifunções. Use \`${prefix}help\` para ver os comandos.`,
    terms: {
      doneTitle: 'Tudo pronto!',
      doneDescription: (language: string) =>
        `Seu idioma foi definido como **${language}**. Agora você já pode usar a Nori.`,
    },
    permissions: {
      missing: (permissions: string) =>
        `> [!WARNING]\n> Eu não tenho permissão suficiente para executar este comando, eu preciso dessa seguinte(s) permissão: ${permissions}`,
      names: {
        ViewChannel: 'Ver Canal',
        SendMessages: 'Enviar Mensagens',
        EmbedLinks: 'Inserir Links',
        AttachFiles: 'Enviar Anexos',
        Connect: 'Entrar em Canal de Voz',
        Speak: 'Falar em Canal de Voz',
      },
    },
    music: {
      player: {
        duration: (minutes: number, seconds: number) =>
          [
            minutes > 0 && `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`,
            seconds > 0 && `${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}`,
          ]
            .filter(Boolean)
            .join(' e '),
        queueEnded: (time: string) =>
          `A fila acabou. Você tem ${time} para adicionar outra música antes de eu encerrar o player.`,
        nowPlaying: 'Tocando agora',
        requestedBy: (username: string) => `Pedido por ${username}`,
        idleLeft: (time: string) =>
          `Como ninguém colocou uma música em ${time}, estou saindo da call por enquanto. Quando quiser ouvir algo de novo, é só me chamar!`,
        kicked: 'Fui expulso da call por um moderador e encerrei o player.',
        alone: (time: string) => `Estou sozinho na call. Se ninguém entrar em ${time}, vou encerrar o player.`,
      },
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
      volume: {
        nothingPlaying: 'Não há nada tocando no momento.',
        notInVoice: 'Você precisa estar em um canal de voz.',
        notInSameVoice: 'Você precisa estar no mesmo canal de voz que eu.',
        invalid: (min: number, max: number) => `Informe um volume entre ${min} e ${max}.`,
        current: (volume: number) => `O volume atual é **${volume}%**.`,
        changed: (volume: number) => `Volume ajustado para **${volume}%**.`,
      },
      skip: {
        nothingPlaying: 'Não há nada tocando no momento.',
        notInVoice: 'Você precisa estar em um canal de voz.',
        notInSameVoice: 'Você precisa estar no mesmo canal de voz que eu.',
        skipped: (title: string) => `Música pulada: **${title}**`,
      },
      pause: {
        nothingPlaying: 'Não há nada tocando no momento.',
        notInVoice: 'Você precisa estar em um canal de voz.',
        notInSameVoice: 'Você precisa estar no mesmo canal de voz que eu.',
        paused: (title: string) => `Música pausada: **${title}**`,
      },
      resume: {
        nothingPlaying: 'Não há nada tocando no momento.',
        notInVoice: 'Você precisa estar em um canal de voz.',
        notInSameVoice: 'Você precisa estar no mesmo canal de voz que eu.',
        notPaused: 'O player não está pausado.',
        resumed: (title: string) => `Retomando: **${title}**`,
      },
      shuffle: {
        nothingPlaying: 'Não há nada tocando no momento.',
        notInVoice: 'Você precisa estar em um canal de voz.',
        notInSameVoice: 'Você precisa estar no mesmo canal de voz que eu.',
        notEnough: 'Não há músicas suficientes na fila para embaralhar.',
        shuffled: (total: number) => `**${total}** ${total === 1 ? 'música embaralhada' : 'músicas embaralhadas'} na fila.`,
      },
      clear: {
        nothingPlaying: 'Não há nada tocando no momento.',
        notInVoice: 'Você precisa estar em um canal de voz.',
        notInSameVoice: 'Você precisa estar no mesmo canal de voz que eu.',
        empty: 'Não há músicas na fila para limpar.',
        cleared: (total: number) => `**${total}** ${total === 1 ? 'música removida' : 'músicas removidas'} da fila.`,
      },
      loop: {
        usage: (prefix: string) =>
          `Uso correto: \`${prefix}loop <modo>\`\n\n**Modos**\n\`off\` - desativa o loop\n\`track\` - repete a música atual\n\`queue\` - repete a fila inteira\n\`playlist\` - repete a playlist`,
        nothingPlaying: 'Não há nada tocando no momento.',
        notInVoice: 'Você precisa estar em um canal de voz.',
        notInSameVoice: 'Você precisa estar no mesmo canal de voz que eu.',
        off: 'Loop desativado.',
        track: 'Repetindo a música atual.',
        queue: 'Repetindo a fila inteira.',
        playlist: 'Repetindo a playlist.',
      },
      queue: {
        empty: 'A fila está vazia.',
        title: 'Fila de músicas',
        nowPlaying: 'Tocando agora',
        upNext: 'Próximas',
        nothingNext: 'Não há mais músicas na fila.',
        requestedBy: (username: string) => `pedido por ${username}`,
        invalidPage: (max: number) => `Página inválida. Use um número entre 1 e ${max}.`,
        footer: (page: number, pages: number, total: number) =>
          `Página ${page}/${pages} • ${total} ${total === 1 ? 'música' : 'músicas'} na fila`,
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
        invite: 'Me adicione!',
        footer: (prefix: string) => `Use ${prefix}help <comando> para ver os detalhes`,
      },
      ping: {
        title: `${constants.emojis.static.pingpong} Pong!`,
        unavailable: 'n/d',
        latencyField: 'Latência',
        gateway: 'Gateway',
        api: 'API',
        message: 'Mensagem',
        footer: (username: string) => `Solicitado por ${username}`,
      },
      node: {
        title: 'Nodes',
        unavailable: 'n/d',
        status: 'Status',
        online: 'Online',
        offline: 'Offline',
        latency: 'Latência',
        players: 'Players',
        cpu: 'CPU',
        ram: 'RAM',
        uptime: 'Uptime',
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
    owner: {
      premium: {
        usage: (prefix: string) => `Uso correto: \`${prefix}premium <id do servidor> [on|off]\``,
        status: (guildId: string, enabled: boolean) =>
          `Premium do servidor \`${guildId}\`: **${enabled ? 'ativado' : 'desativado'}**.`,
        failed: 'Não consegui alterar o premium agora. Tente novamente.',
      },
      blacklist: {
        usage: (prefix: string, categories: string) =>
          `Uso correto:\n\`${prefix}blacklist add <id do usuário> <categoria|all> <duração|perm> [motivo]\`\n\`${prefix}blacklist remove <id do usuário>\`\n\`${prefix}blacklist check <id do usuário>\`\n\`${prefix}blacklist list\`\n\n**Categorias:** all, ${categories}\n**Duração:** \`30m\`, \`12h\`, \`7d\`, \`2w\` ou \`perm\``,
        all: 'Todas',
        permanent: 'Permanente',
        noReason: 'Sem motivo informado.',
        protected: 'Você não pode colocar um desenvolvedor na blacklist.',
        invalidScope: (categories: string) => `Categoria inválida. Use \`all\` ou uma destas: ${categories}`,
        invalidDuration: 'Duração inválida. Use algo como `30m`, `12h`, `7d`, `2w` ou `perm`.',
        added: (id: string, scope: string, time: string) =>
          `${constants.emojis.static.hammer} <@${id}> foi adicionado à blacklist.\nCategoria: ${scope}\nDuração: ${time}`,
        updated: (id: string, scope: string, time: string) =>
          `${constants.emojis.static.hammer} A blacklist de <@${id}> foi atualizada.\nCategoria: ${scope}\nDuração: ${time}`,
        removed: (id: string) => `\`${id}\` foi removido da blacklist.`,
        notFound: (id: string) => `\`${id}\` não está na blacklist.`,
        check: (id: string, reason: string, authorId: string, scope: string, time: string) =>
          `${constants.emojis.static.barred} <@${id}> está na blacklist.\nMotivo: ${reason}\nCategoria: ${scope}\nDuração: ${time}\nAdicionado por: <@${authorId}>`,
        empty: 'A blacklist está vazia.',
        listTitle: (total: number) => `Blacklist (${total})`,
        entry: (id: string, scope: string, time: string, reason: string) =>
          `\`${id}\` - ${scope} - ${time} - ${reason}`,
        more: (amount: number) => `E mais ${amount}...`,
        failed: 'Não consegui atualizar a blacklist agora. Tente novamente.',
      },
    },
  },
};
