# AGENTS.md - Coding Agent Guidelines

## Critical: Read SCHEMA.md First

> **BEFORE making any changes to database schema, API routes, or features involving data models, you MUST read `SCHEMA.md` thoroughly.**

The `SCHEMA.md` file documents:

- Core domain concepts (Collection vs Lists, ownership model)
- Table relationships and their intent
- Design decisions and their rationale
- Typical user workflows

Understanding these concepts is essential to avoid breaking the application's data model. Key concepts to understand:

- **Collection** (`collection_card`) = source of truth for owned cards
- **Lists** (`virtual_list`) = staging areas and references, NOT ownership
- Lists and Collection are intentionally separate - changes to one should not automatically affect the other

## Project Overview

Mana-vault is a TypeScript monorepo built with the Better-T-Stack. It consists of:

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

### Package Manager

- Uses **Bun** (`bun@1.3.6`) - always use `bun` instead of `npm` or `yarn`
- Install dependencies: `bun install`

### Monorepo Commands (from root)

```bash
bun run dev              # Start all apps in dev mode (Turborepo)
bun run build            # Build all apps
bun run check-types      # TypeScript type checking across all apps
bun run check            # Run oxlint + oxfmt (lint & format)
```

### App-Specific Commands

```bash
bun run dev:web          # Start web app only (port 3001)
bun run dev:server       # Start server only (port 3002)
bun run dev:native       # Start Expo/React Native dev server
```

### Database Commands

```bash
bun run db:generate      # Generate Drizzle migrations (ALWAYS use this)
```

> **IMPORTANT**: Always use `db:generate` to create proper SQL migration files. **Never use `db:push`** to force sync the database. Migration files provide a clear history of schema changes and allow for safe, reviewable deployments.

### Deployment (Cloudflare via Alchemy)

```bash
bun run deploy           # Deploy to Cloudflare
bun run destroy          # Destroy Cloudflare resources
```

### Linting & Formatting

- **Linter**: oxlint (configured in `.oxlintrc.json`)
- **Formatter**: oxfmt
- Run both: `bun run check`
- Pre-commit hooks via Lefthook auto-fix staged files
- **IMPORTANT** Always run formatting from the root of the repo after making changes via `bun format`. Do not use `bunx oxfmt`.

### Testing

- No test framework is currently configured in this project
- If adding tests, use `bun:test` or Vitest (both compatible with Bun)

### Development Server

> **IMPORTANT**: The development server is always running and managed by the user. Do NOT attempt to start the server yourself with `bun run dev`, `bun run dev:web`, or `bun run dev:server`. Simply assume the server is available at:
>
> - **Web app**: http://localhost:3001
> - **API server**: http://localhost:3002

### Browser End-to-End Testing (agent-browser)

> **IMPORTANT**: All browser-based end-to-end testing MUST be performed using the `agent-browser` CLI tool. Do not use Playwright, Puppeteer, or other browser automation libraries directly.

**Default Test Credentials:**

- Email: `jesse@thecarters.cloud`
- Password: `Password1!`

**Common Commands:**

```bash
agent-browser open http://localhost:3001        # Open the web app
agent-browser snapshot -i                       # Get interactive elements with refs
agent-browser click @e2                         # Click element by ref from snapshot
agent-browser fill @e3 "text"                   # Clear and fill input field
agent-browser type @e3 "text"                   # Type into input field
agent-browser press Enter                       # Press keyboard key
agent-browser screenshot                        # Take screenshot
agent-browser screenshot --full                 # Full page screenshot
agent-browser get text @e1                      # Get text content of element
agent-browser wait 2000                         # Wait 2 seconds
agent-browser wait "[data-testid='element']"   # Wait for element
```

**Typical Login Flow:**

```bash
agent-browser open http://localhost:3001/login
agent-browser snapshot -i
agent-browser fill "[name='email']" "jesse@thecarters.cloud"
agent-browser fill "[name='password']" "Password1!"
agent-browser click "button[type='submit']"
agent-browser wait 2000
agent-browser snapshot -i  # Verify logged in state
```

**Best Practices:**

1. **Always use `snapshot -i`** after navigation or actions to get current interactive elements with refs
2. **Use refs (@e1, @e2, etc.)** from snapshots for reliable element targeting
3. **Use CSS selectors** when refs are not suitable (e.g., `[data-testid='...']`, `[name='...']`)
4. **Add waits** after actions that trigger navigation or async updates
5. **Take screenshots** when debugging or verifying visual state
6. **Use sessions** (`--session <name>`) to isolate test runs
7. **Use short wait times** - The app is designed to be snappy. Start with short intervals like `150ms` and only increase if needed. Avoid defaulting to long waits like `1000ms` or `2000ms`.

**Session Management:**

```bash
agent-browser --session test1 open http://localhost:3001  # Isolated session
agent-browser --session test1 snapshot -i                 # Same session
agent-browser session list                                # List active sessions
```

**Debugging:**

```bash
agent-browser --headed open http://localhost:3001  # Show browser window
agent-browser console                              # View console logs
agent-browser errors                               # View page errors
agent-browser highlight "[selector]"               # Highlight element
```

## Code Style Guidelines

### TypeScript Configuration

- Target: ESNext with bundler module resolution
- Strict mode enabled with additional checks:
  - `noUncheckedIndexedAccess`: true
  - `noUnusedLocals`: true
  - `noUnusedParameters`: true
  - `verbatimModuleSyntax`: true
- Config extends `@mana-vault/config/tsconfig.base.json`

### Import Organization

1. External/third-party imports first (React, libraries)
2. Type imports using `import type { ... }` syntax
3. Internal workspace packages (`@mana-vault/*`)
4. Relative imports last

Example:

```typescript
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import z from "zod";

import type { AppRouterClient } from "@mana-vault/api/routers/index";

import { authClient } from "@/lib/auth-client";
import { Button } from "./ui/button";
```

### Naming Conventions

- **Files**: kebab-case (`sign-in-form.tsx`, `auth-client.ts`)
- **Components**: PascalCase (`SignInForm`, `RouteComponent`)
- **Functions/variables**: camelCase (`createContext`, `queryClient`)
- **Types/Interfaces**: PascalCase (`Context`, `CreateContextOptions`)
- **Constants**: camelCase for module-level (`appRouter`, `buttonVariants`)
- **Database tables**: snake_case (`user_id`, `created_at`)
- **Drizzle schema exports**: camelCase (`user`, `session`, `account`)

### React Components

- Use function declarations for page/route components
- Use `export default` for route components
- Use named exports for reusable components
- Props destructuring in function signature
- Use `@/` alias for src-relative imports in web app

```typescript
// Route component
export const Route = createFileRoute("/login")({
  component: RouteComponent,
});

function RouteComponent() {
  // ...
}

// Reusable component
export function Button({ className, variant, ...props }: ButtonProps) {
  // ...
}
```

### Styling

- TailwindCSS v4 with `@tailwindcss/vite` plugin
- Use `cn()` utility from `@/lib/utils` for class merging
- Component variants via `class-variance-authority` (cva)
- shadcn/ui components in `apps/web/src/components/ui/`

### API Layer (oRPC)

- Define procedures in `packages/api/src/`
- Use `publicProcedure` for unauthenticated endpoints
- Use `protectedProcedure` for authenticated endpoints
- Zod for input/output validation

```typescript
export const appRouter = {
  healthCheck: publicProcedure.handler(() => "OK"),
  privateData: protectedProcedure.handler(({ context }) => ({
    message: "Private",
    user: context.session?.user,
  })),
};
```

### Database (Drizzle ORM)

- Schema files in `packages/db/src/schema/`
- Use SQLite with D1 (Cloudflare) dialect
- Column naming: snake_case in database, camelCase in TypeScript
- Always define relations separately from table definitions
- Use `integer` with `mode: "timestamp_ms"` for dates
- **IMPORTANT**: Before modifying schema or writing queries, review `SCHEMA.md` to understand the data model and relationships

### Data Model Guidelines

When working with the core data model, keep these principles in mind:

1. **Collection is the source of truth**: `collection_card` represents cards the user physically owns. Each row = one physical card.

2. **Lists are separate from Collection**: `virtual_list` and `virtual_list_card` are staging areas and historical records. They reference cards but don't represent ownership.

3. **Never auto-create collection cards**: When importing to lists, only create `virtual_list_card` entries with `scryfall_card_id`. Collection cards are only created via explicit "move to collection" action.

4. **Never delete collection cards from list operations**: Deleting a list should only remove `virtual_list` and `virtual_list_card` entries. Collection cards are independent.

5. **Soft deletes for collection cards**: Use `status` field (owned/traded/sold/lost) instead of hard deletes to preserve history.

### Error Handling

- Use `ORPCError` for API errors with standard codes
- Toast notifications via `sonner` for user-facing errors
- QueryClient global error handler shows toast with retry action

```typescript
// API error
throw new ORPCError("UNAUTHORIZED");

// Client-side error handling
onError: (error) => {
  toast.error(error.error.message || error.error.statusText);
};
```

### Environment Variables

- Validated via Zod in `packages/env/`
- Server env: `@mana-vault/env/server`
- Web env: `@mana-vault/env/web`
- Native env: `@mana-vault/env/native`
- Server `.env` files go in `apps/server/.env`

### React Native (Expo)

- Expo Router for file-based routing in `apps/native/app/`
- HeroUI Native for UI components
- Uniwind for Tailwind-like styling
- Use `@/` alias for src-relative imports

## Key Dependencies

- **Frontend**: React 19, TanStack Router, TanStack Query, TanStack Form
- **Backend**: Hono, oRPC, Better-Auth
- **Database**: Drizzle ORM, libsql, D1 (Cloudflare)
- **Styling**: TailwindCSS v4, shadcn/ui, class-variance-authority
- **Validation**: Zod v4
- **Mobile**: Expo 54, React Native 0.81

## Pre-commit Hooks (Lefthook)

Automatically runs on staged files:

1. `oxlint --fix` - Linting with auto-fix
2. `oxfmt --write` - Formatting
