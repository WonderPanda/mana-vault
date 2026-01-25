/**
 * Downloads bulk Scryfall card data to the scryfall-data directory.
 *
 * Usage: bun run scripts/download-scryfall-data.ts
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BULK_DATA_ENDPOINT =
	"https://api.scryfall.com/bulk-data/922288cb-4bef-45e1-bb30-0c2bd3d3534f";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "..", "scryfall-data");

interface BulkDataResponse {
	object: string;
	id: string;
	type: string;
	updated_at: string;
	uri: string;
	name: string;
	description: string;
	size: number;
	download_uri: string;
	content_type: string;
	content_encoding: string;
}

async function downloadScryfallData() {
	console.log("Fetching bulk data metadata from Scryfall...");

	const metadataResponse = await fetch(BULK_DATA_ENDPOINT);
	if (!metadataResponse.ok) {
		throw new Error(
			`Failed to fetch bulk data metadata: ${metadataResponse.statusText}`,
		);
	}

	const metadata: BulkDataResponse = await metadataResponse.json();
	console.log(`Found: ${metadata.name}`);
	console.log(`Description: ${metadata.description}`);
	console.log(`Size: ${(metadata.size / 1024 / 1024).toFixed(2)} MB`);
	console.log(`Last updated: ${metadata.updated_at}`);

	// Create output directory
	await mkdir(OUTPUT_DIR, { recursive: true });

	console.log(`\nDownloading from ${metadata.download_uri}...`);

	const dataResponse = await fetch(metadata.download_uri);
	if (!dataResponse.ok) {
		throw new Error(`Failed to download data: ${dataResponse.statusText}`);
	}

	const data = await dataResponse.arrayBuffer();
	const outputPath = join(OUTPUT_DIR, "all-cards.json");

	await writeFile(outputPath, Buffer.from(data));
	console.log(`\nSaved to ${outputPath}`);
	console.log("Done!");
}

downloadScryfallData().catch((error) => {
	console.error("Error:", error.message);
	process.exit(1);
});
