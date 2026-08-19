export { SyncPublisherDurableObject } from "../../src/sync-events";

export default {
  fetch() {
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler;
