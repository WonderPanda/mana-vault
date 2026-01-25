import { env } from "@mana-vault/env/server";
import { Polar } from "@polar-sh/sdk";

export const polarClient = new Polar({
  accessToken: env.POLAR_ACCESS_TOKEN,
  // TODO: Pull from ENV
  server: "sandbox",
});
