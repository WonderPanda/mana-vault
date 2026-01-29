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

---

## 3. PWA service worker serves stale content after deploys

**Symptom:** After deploying frontend changes, users still see the old version until they empty cache and hard reload. The default `vite-plugin-pwa` configuration precaches all build assets but doesn't properly invalidate or reload when a new service worker activates.

**Cause:** The template configures `VitePWA` with `registerType: "autoUpdate"` but provides no Workbox options and no service worker registration in app code. The default Workbox precaching strategy caches everything aggressively, and without `skipWaiting` / `clientsClaim`, the new service worker waits for all tabs to close before activating. Even when it does activate, there's no mechanism to reload the page with fresh content.

Additionally, `workbox-window` is not included as a dependency, so the dev server fails with:

```
Failed to resolve import "workbox-window" from "/@vite-plugin-pwa/virtual:pwa-register"
```

**Fix:**

1. Install `workbox-window`:

   ```bash
   bun add workbox-window
   ```

2. Add Workbox options to the PWA plugin in `apps/web/vite.config.ts`:

   ```typescript
   VitePWA({
     registerType: "autoUpdate",
     manifest: { /* ... */ },
     workbox: {
       skipWaiting: true,
       clientsClaim: true,
       cleanupOutdatedCaches: true,
       navigateFallback: "/index.html",
     },
     // ...
   })
   ```

3. Register the service worker in `apps/web/src/main.tsx` to auto-reload on updates:

   ```typescript
   import { registerSW } from "virtual:pwa-register";

   registerSW({
     onNeedRefresh() {
       window.location.reload();
     },
   });
   ```

4. Add `vite-plugin-pwa/client` to `apps/web/tsconfig.json` for TypeScript support:

   ```json
   {
     "compilerOptions": {
       "types": ["vite/client", "vite-plugin-pwa/client", "@cloudflare/workers-types"]
     }
   }
   ```
