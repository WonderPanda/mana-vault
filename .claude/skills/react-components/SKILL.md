---
name: react-components
description: >
  React component patterns, styling conventions, and UI guidelines for Mana Vault web app.
  Use when creating or modifying React components, working with TailwindCSS, shadcn/ui,
  class-variance-authority, or route components in TanStack Router.
---

# React Components

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

## Styling

- TailwindCSS v4 with `@tailwindcss/vite` plugin
- Use `cn()` utility from `@/lib/utils` for class merging
- Component variants via `class-variance-authority` (cva)
- shadcn/ui components in `apps/web/src/components/ui/`
