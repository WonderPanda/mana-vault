# AGENTS.md - Coding Agent Guidelines

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
bun run dev:server       # Start server only (port 3000)
bun run dev:native       # Start Expo/React Native dev server
```

### Database Commands
```bash
bun run db:push          # Push schema changes to database
bun run db:generate      # Generate Drizzle migrations
```

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

### Testing
- No test framework is currently configured in this project
- If adding tests, use `bun:test` or Vitest (both compatible with Bun)

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
}
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
