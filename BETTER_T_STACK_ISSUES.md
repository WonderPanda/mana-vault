# Better-T-Stack Template Issues

A running list of fixes needed when using the Better-T-Stack template.

---

## 1. `cloudflare:workers` type checking error in web app

**Symptom:** `tsc` fails in the web app with:

```
Cannot find module 'cloudflare:workers' or its corresponding type declarations.
```

**Cause:** The web app transitively imports `@mana-vault/env/server` through the type chain:

```
web → @mana-vault/api (types) → @mana-vault/auth → @mana-vault/env/server
```

The server env exports from `cloudflare:workers`, a virtual module only available at runtime in Cloudflare Workers. The web app's tsconfig doesn't include the Cloudflare type definitions.

**Fix:** Add `@cloudflare/workers-types` to the web app:

1. Install the types:

   ```bash
   bun add -D @cloudflare/workers-types
   ```

2. Update `apps/web/tsconfig.json`:
   ```json
   {
     "compilerOptions": {
       "types": ["vite/client", "@cloudflare/workers-types"]
     }
   }
   ```

---

## 2. `oxfmt` format command doesn't format any files

**Symptom:** Running `bun run format` with `oxfmt --write` produces no output and doesn't format any files.

**Cause:** `oxfmt` requires an explicit path argument to know which files to format. Without a path, it silently does nothing.

**Fix:** Add `.` (current directory) as the path argument:

```json
{
  "scripts": {
    "check": "oxlint && oxfmt --check .",
    "format": "oxfmt --write ."
  }
}
```
