<div align="center">
  <img src="https://fluxerusercontent.com/avatars/1562075950991020032/ee1d2674.png?size=1024" alt="Nori" width="128" height="128" />
  <h1>Nori</h1>
  <p>Multipurpose bot for Fluxer.</p>
  <p>
    <a href="https://noribot.xyz">Website</a>
    ·
    <a href="https://noribot.xyz/terms">Terms of Service</a>
    ·
    <a href="https://noribot.xyz/privacy">Privacy Policy</a>
  </p>
</div>

---

Nori is a free multipurpose bot for Fluxer, built with TypeScript and [fluxer.js](https://fluxer.js.org). It brings multiple features together in one bot, providing a convenient and versatile experience for your server.

## Features

- Music playback in voice channels with a queue system
- Spotify as the default music search provider
- Multiple commands for server utilities and entertainment
- Portuguese (Brazil) and English (US) language support
- Accept the Terms of Service and choose your language through message reactions
- Simple command system using the `n.` prefix

## Getting Started

1. Add Nori to your server.
2. Use `n.help` to view the available commands.
3. On your first use, react to the message to accept the Terms of Service and select your language.

## Development

### Requirements

- Node.js
- npm
- MongoDB
- A configured Lavalink node

### Installation

```bash
npm install
cp .env.example .env
```

Edit the `.env` file and fill in the required credentials and configuration values.

Once configured, start the bot in development mode:

```bash
npm run dev
```

### Technologies

- [fluxer.js](https://fluxer.js.org) (`@fluxerjs/core`, `@fluxerjs/voice`)
- `lavalink-client`
- MongoDB
- TypeScript

## Links

- Website: https://noribot.xyz
- Terms of Service: https://noribot.xyz/terms
- Privacy Policy: https://noribot.xyz/privacy
