# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Any Association Bot (anybot) is a GitHub App built with Probot that manages repositories for the Any Association. It has two main components:
- **Probot** (`/src/`): Handles GitHub webhooks for contributor management and issue assignment
- **Timer trigger** (`/timerTrigger/`): Azure Functions app for scheduled automation tasks

## Development Commands

### Probot Commands
```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run the bot
npm start

# Type checking
npm run typecheck

# Linting
npm run lint        # Check for issues
npm run lint:fix    # Auto-fix issues

# Code formatting
npm run format
```

### Timer Trigger Commands
```bash
# Navigate to timer trigger
cd timerTrigger

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run Azure Functions locally
npm start

# Development mode with watch
npm run watch

# Linting and formatting (same as main)
npm run lint
npm run format
```

### Docker Development
```bash
# Start all services
make start

# Stop services
make stop

# View logs
make logs

# Restart services
make restart
```

## Architecture & Key Files

### Core Modules
- **`src/index.ts`**: Entry point for Probot that registers contributorsManager and projectManager modules
- **`src/contributorsManager.ts`**: Handles @any/@anybot mentions for contributor acknowledgment
- **`src/projectManager.ts`**: Manages GitHub project boards and issue assignments with Linear integration
- **`src/graphql.ts`** & **`src/linear.ts`**: Shared between Probot and timer trigger for API integrations

### Configuration
- **TypeScript**: Strict mode enabled, ES2022 target, module resolution set to Node
- **ESLint**: Modern flat config with TypeScript and Prettier integration
- **Node.js**: Requires 20.18.0+

### Key Integration Points
1. **GitHub GraphQL API**: Used for project board management and issue operations
2. **Linear SDK**: Synchronizes project status between GitHub and Linear
3. **Probot Context**: Access GitHub API through `context.octokit` in event handlers

### Environment Setup
The bot uses environment-specific configuration:
- Production deployment on `main` branch
- Test deployment on `test-any-bot` branch
- Configuration mounted via Docker volumes at `/app/.env`

## Important Development Notes

1. **Dual Codebase**: Changes to `graphql.ts` or `linear.ts` may need to be copied to both `/src/` and `/timerTrigger/src/`
2. **Type Safety**: Always run `npm run typecheck` before committing
3. **Code Style**: Run `npm run lint:fix` and `npm run format` to maintain consistent style
4. **Docker Context**: Local development uses Docker Compose with Azurite for Azure Storage emulation
5. **No Tests**: Currently no test framework is configured - be extra careful with changes