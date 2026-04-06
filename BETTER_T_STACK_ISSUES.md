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

---

## 4. PWA manifest not recognized on Cloudflare Workers (no install prompt)

**Symptom:** The browser never shows the PWA install prompt (desktop install icon, "Add to Home Screen" banner). Chrome DevTools Application panel shows the manifest is loaded but the installability check fails.

**Cause:** `vite-plugin-pwa` outputs `manifest.webmanifest` by default. Cloudflare Workers (via Alchemy's `Vite` resource) doesn't map the `.webmanifest` extension to a MIME type, so the file is served without a `Content-Type` header. Browsers require a recognized content type (`application/manifest+json` or `application/json`) to parse the manifest.

**Verify:** Check the response headers of the manifest URL:

```bash
curl -sI https://your-app.workers.dev/manifest.webmanifest | grep content-type
# If missing or wrong, this is the issue
```

**Fix:** Set `manifestFilename` to `manifest.json` in the PWA plugin config. Cloudflare Workers serves `.json` files with `content-type: application/json`, which browsers accept for PWA manifests.

```typescript
// apps/web/vite.config.ts
VitePWA({
  registerType: "autoUpdate",
  manifestFilename: "manifest.json", // ← add this
  manifest: { /* ... */ },
  // ...
})
```

---

## 5. PWA icons not generated (missing install prompt)

**Symptom:** The PWA manifest exists but has no `icons` array, or the icon files 404. The browser won't show the install prompt without valid 192x192 and 512x512 icons.

**Cause:** The template sets up `@vite-pwa/assets-generator` with a `pwa-assets.config.ts` file and a `generate-pwa-assets` script, but the icon generation is handled automatically by the `pwaAssets` integration in `vite-plugin-pwa` during builds — no manual step needed. However, if `pwaAssets` is not configured, or if the source image is missing, no icons are generated.

**Fix:** Ensure these three pieces are in place:

1. A source image at `apps/web/public/logo.png` (at least 512x512 px recommended)

2. A `pwa-assets.config.ts` in `apps/web/`:

   ```typescript
   import { defineConfig, minimal2023Preset as preset } from "@vite-pwa/assets-generator/config";

   export default defineConfig({
     headLinkOptions: { preset: "2023" },
     preset,
     images: ["public/logo.png"],
   });
   ```

3. The `pwaAssets` integration enabled in `vite.config.ts`:

   ```typescript
   VitePWA({
     // ...
     pwaAssets: { disabled: false, config: true },
   })
   ```

The Vite build will then auto-generate all required icons (64x64, 192x192, 512x512, maskable, apple-touch-icon, favicon) and inject them into the manifest and HTML. No separate `generate-pwa-assets` step is needed in CI/deploy.
