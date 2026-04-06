# Mana Vault - Agent Guidelines

## Critical: Read SCHEMA.md First

> **BEFORE making any changes to database schema, API routes, or features involving data models, you MUST read `SCHEMA.md` thoroughly.** It documents core domain concepts, table relationships, design decisions, and typical user workflows.

## Project Overview

Mana-vault is a TypeScript monorepo built with the Better-T-Stack:

- **apps/web**: React + TanStack Router frontend (Vite, TailwindCSS, shadcn/ui)
- **apps/native**: React Native + Expo mobile app
- **apps/server**: Hono backend API with oRPC
- **packages/api**: Shared API layer and business logic
- **packages/auth**: Better-Auth authentication configuration
- **packages/db**: Drizzle ORM schema and database utilities
- **packages/env**: Environment variable validation (Zod-based)
- **packages/config**: Shared TypeScript configuration
- **packages/infra**: Alchemy deployment configuration

## Build/Lint/Test Commands

- Uses **Bun** (`bun@1.3.6`) - always use `bun` instead of `npm` or `yarn`
- `bun run dev` — Start all apps (Turborepo)
- `bun run build` — Build all apps
- `bun run check-types` — TypeScript type checking across all packages
- `bun run check` — Run oxlint + oxfmt (lint & format)
- `bun run dev:web` / `bun run dev:server` / `bun run dev:native` — Start individual apps
- `bun run db:generate` — Generate Drizzle migrations (**never use `db:push`**)
- `bun run deploy` — Deploy to Cloudflare via Alchemy
- `bun run e2e` — Run Playwright E2E tests
- `bun run seed` — Seed test account

> **IMPORTANT**: The dev server is always running and managed by the user. Do NOT start it yourself. Web: http://localhost:3001, API: http://localhost:3002

> **DO NOT run formatting commands manually.** Lefthook pre-commit hooks auto-format all staged files.

## Code Style

### TypeScript

- Target: ESNext, strict mode, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`

### Imports

1. External/third-party imports first
2. Type imports using `import type { ... }` syntax
3. Internal workspace packages (`@mana-vault/*`)
4. Relative imports last

### Naming

- **Files**: kebab-case (`sign-in-form.tsx`)
- **Components/Types**: PascalCase (`SignInForm`)
- **Functions/variables**: camelCase (`createContext`)
- **Database tables**: snake_case (`user_id`, `created_at`)
- **Drizzle schema exports**: camelCase (`user`, `session`)

## Key Dependencies

- **Frontend**: React 19, TanStack Router, TanStack Query, TanStack Form
- **Client-Side DB**: TanStack DB, RxDB, Dexie (local-first reactive data)
- **Backend**: Hono, oRPC, Better-Auth
- **Database**: Drizzle ORM, libsql, D1 (Cloudflare)
- **Styling**: TailwindCSS v4, shadcn/ui, class-variance-authority
- **Validation**: Zod v4
- **Mobile**: Expo 54, React Native 0.81

<!-- intent-skills:start -->

# Skill mappings - when working in these areas, load the linked skill file into context.

skills:

- task: "Writing or modifying useLiveQuery, useLiveSuspenseQuery, or useLiveInfiniteQuery hooks"
  load: "node_modules/@tanstack/react-db/skills/react-db/SKILL.md"
- task: "Building or editing TanStack DB live queries (from, where, join, select, orderBy, groupBy, aggregates)"
  load: "node_modules/@tanstack/db/skills/db-core/live-queries/SKILL.md"
- task: "Setting up or configuring TanStack DB collections (createCollection, adapters, sync)"
  load: "node_modules/@tanstack/db/skills/db-core/collection-setup/SKILL.md"
- task: "Working with optimistic mutations, inserts, updates, deletes, or transactions on TanStack DB collections"
  load: "node_modules/@tanstack/db/skills/db-core/mutations-optimistic/SKILL.md"
- task: "Configuring TanStack DB persistence (SQLite, OPFS, local-only storage)"
load: "node_modules/@tanstack/db/skills/db-core/persistence/SKILL.md"
<!-- intent-skills:end -->
