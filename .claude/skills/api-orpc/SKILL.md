---
name: api-orpc
description: >
  oRPC API layer patterns for Mana Vault. Use when creating or modifying API routes/procedures,
  working with oRPC server or client code, adding new endpoints, or debugging API errors.
  Covers procedure types, Zod validation, error handling, and client-side query/mutation patterns.
---

# API Layer (oRPC)

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

## Error Handling

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
