import { cors } from "hono/cors";

export function apiCors(origin: string) {
  return cors({
    origin,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-oRPC-Last-Event-ID"],
    credentials: true,
  });
}
