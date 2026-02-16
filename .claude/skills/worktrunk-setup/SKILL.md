---
name: worktrunk-setup
description: >
  Set up worktrunk (git worktree manager) with dynamic port allocation for Better-T-Stack monorepos
  using Doppler, Alchemy, and Vite. Use when bootstrapping a new project's worktree workflow, or when
  asked to "set up worktrunk", "configure worktrees", "add worktree support", or "set up dynamic ports
  for worktrees". Covers: post-create hooks (Doppler setup, dependency install, .env.worktree generation),
  env-based port overrides in Vite and Alchemy configs, and dev script modification to source worktree-specific
  env vars after Doppler injection.
---

# Worktrunk Setup for Better-T-Stack

Configure worktrunk so each worktree gets isolated dev server ports via `hash_port`, preventing port conflicts when running multiple worktrees simultaneously.

## Prerequisites

- Worktrunk CLI installed (`wt`)
- Doppler CLI configured for the project
- Better-T-Stack monorepo with Alchemy (infra), Vite (web), and Hono (server)

## Setup Steps

### 1. Make ports configurable via env vars

**`apps/web/vite.config.ts`** — read web port from env:

```ts
server: {
  port: Number(process.env.DEV_WEB_PORT) || 3001,
},
```

**`packages/infra/alchemy.run.ts`** — read server port from env:

```ts
dev: {
  port: Number(process.env.DEV_SERVER_PORT) || 3007,
},
```

### 2. Source `.env.worktree` after Doppler in dev script

**`package.json`** — modify the `dev` script to source `.env.worktree` (if present) after Doppler injects base env vars, overriding port-dependent values in worktrees:

```json
"dev": "doppler run -c dev -- sh -c '[ -f .env.worktree ] && set -a && . ./.env.worktree && set +a; exec turbo dev'"
```

In the main checkout, `.env.worktree` doesn't exist so Doppler defaults pass through unchanged.

### 3. Create `.config/wt.toml` project hooks

```toml
[post-create]
doppler = "doppler setup -p <PROJECT_NAME> -c dev --no-interactive"
install = "bun install"
env = """
cat > .env.worktree << 'EOF'
DEV_WEB_PORT={{ branch | hash_port }}
DEV_SERVER_PORT={{ ('server-' ~ branch) | hash_port }}
CORS_ORIGIN=http://localhost:{{ branch | hash_port }}
VITE_SERVER_URL=http://localhost:{{ ('server-' ~ branch) | hash_port }}
BETTER_AUTH_URL=http://localhost:{{ ('server-' ~ branch) | hash_port }}
EOF
"""

[post-start]
copy = "wt step copy-ignored"

[pre-merge]
lint = "bun run check"
typecheck = "bun run check-types"

[list]
url = "http://localhost:{{ branch | hash_port }}"
```

Replace `<PROJECT_NAME>` with the Doppler project name.

The `('server-' ~ branch) | hash_port` concatenation ensures web and server ports never collide — they hash different strings.

Add any additional port-dependent env vars to the `env` hook (e.g., `POLAR_SUCCESS_URL`, webhook URLs).

### 4. Gitignore `.env.worktree`

Add `.env.worktree` to `.gitignore`. Do NOT add it to `.worktreeinclude` — each worktree generates its own.

### 5. Create `.worktreeinclude`

If not already present, create `.worktreeinclude` to copy gitignored files to new worktrees:

```
.claude/**
node_modules/
.env
.turbo/
```

## How It Works

1. `wt switch --create <branch>` runs `post-create` hooks: configures Doppler, installs deps, writes `.env.worktree` with deterministic ports
2. `bun run dev` runs Doppler, then sources `.env.worktree` overrides, then starts Turbo
3. Alchemy reads `DEV_SERVER_PORT`, Vite reads `DEV_WEB_PORT` — both fall back to defaults if unset
4. `wt list` shows each worktree's dev server URL

## Port Allocation

`hash_port` maps strings to ports in the 10000–19999 range. Ports are deterministic — the same branch always gets the same port on any machine.
