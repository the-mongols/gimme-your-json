# gimme-your-json

A modern Discord bot making use of Discord v14.18.0, Bun 1.2.7 runtime, and Drizzle ORM in order to provide roster management and lineup generation for the [PN] Penetration Nation clan in World of Warships. Features include slash commands, database operations, and API connections with Wargaming API + Google API (Sheets and App Scripts).


## Setup ---SUBJECT TO CHANGE---

### Prerequisites

- This project was created using `bun init` in bun v1.2.7. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
- Node.js v16.9 or higher (for Discord.js compatibility)
- A Discord bot token and application ID

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/your-repo-name.git
cd your-repo-name
```

2. Install dependencies:
```bash
bun install
```

3. Create a `.env.local` file in the root directory with your credentials:
```
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_GUILD_ID=your_development_guild_id_here
```

4. Set up the database:
```bash
bun run migrate
bun run seed  # Optional: seed the database with sample data
```

## Running the Bot

```bash
bun run start
```

## Development Commands

- **Start the bot**: `bun run start`
- **Deploy commands to a specific guild**: `bun run deploy`
- **Deploy commands globally**: `bun run deployglobal`
- **Clear guild commands**: `bun run clearguild`
- **Clear global commands**: `bun run clearglobal`
- **Run database migrations**: `bun run migrate`
- **Seed the database**: `bun run seed`

## Project Structure

```
├── .env.local                # Environment variables (not in repository)
├── index.ts                  # Main entry point
├── package.json              # Project configuration and dependencies
├── tsconfig.json             # TypeScript configuration
├── sqlite.db                 # SQLite database file (generated)
├── events/                   # Discord event handlers (root location)
├── src/
│   ├── api/                  # API integrations
│   │   ├── googlesheetsAPI/  # Google Sheets API integration
│   │   └── weegeeAPI/        # Other API integration
│   ├── bot/                  # Discord bot core
│   │   ├── bot.ts            # Bot initialization
│   │   ├── commands/         # Slash commands
│   │   │   ├── registration/ # Command registration scripts
│   │   │   │   ├── deploy-commands.ts
│   │   │   │   ├── global-deploy-commands.ts
│   │   │   │   └── clear-commands.ts
│   │   │   ├── working_former_commands/ # Functional slash commands
│   │   │   └── [command categories]     # New command structure
│   │   └── events/          # Discord event handlers (alternate location)
│   ├── database/            # Database layer
│   │   ├── db.ts            # Database connection
│   │   └── drizzle/         # Drizzle ORM
│   │       ├── migrations/  # Database migrations
│   │       ├── schema.ts    # Database schema
│   │       └── seed.ts      # Seed data
│   ├── entryindex.ts        # Secondary entry point (temporary)
│   ├── services/            # Business logic services
│   ├── types/               # TypeScript type definitions
│   └── utils/               # Utility functions
└── tests/                   # Test files
```

## Adding Commands

1. Create a new command file in the appropriate category folder:
   - For new commands: `src/bot/commands/[category]/your-command.ts`
   - For existing commands: Use the files in `src/bot/commands/working_former_commands/[category]/`

2. Deploy the command to your development server:
```bash
bun run deploy
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -am 'Add new feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Submit a pull request

## License

[MIT License](LICENSE)










