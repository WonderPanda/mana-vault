/**
 * Moxfield Text Format Parser
 *
 * Parses deck exports from Moxfield.
 *
 * Format: {quantity} {card name} ({setCode}) {collectorNumber} [*F*]
 *
 * Examples:
 *   1 Toph, Hardheaded Teacher (TLA) 246
 *   1 Ba Sing Se (TLA) 266 *F*
 *   1 Brass's Tunnel-Grinder / Tecutlan, the Searing Rift (LCI) 135
 *   12 Forest (SPM) 198
 *
 * Notes:
 * - The *F* suffix indicates a foil card
 * - Cards may have "/" in their name for double-faced or split cards
 * - SIDEBOARD: delimiter marks the start of sideboard (not yet supported)
 */

export interface MoxfieldRow {
  name: string;
  setCode: string;
  collectorNumber: string;
  quantity: number;
  isFoil: boolean;
}

export interface MoxfieldParseResult {
  success: boolean;
  rows: MoxfieldRow[];
  errors: Array<{
    rowNumber: number;
    error: string;
    rawData: string;
  }>;
  stats: {
    totalRows: number;
    successCount: number;
    errorCount: number;
    totalQuantity: number;
    sideboardSkipped: number;
  };
}

/**
 * Parse a single line in Moxfield format
 *
 * Format: {quantity} {card name} ({setCode}) {collectorNumber} [*F*]
 *
 * @returns Parsed row or null if line is empty/comment/section delimiter
 */
function parseMoxfieldLine(line: string): MoxfieldRow | null | "SIDEBOARD" {
  const trimmed = line.trim();

  // Skip empty lines
  if (!trimmed) {
    return null;
  }

  // Check for SIDEBOARD delimiter
  if (trimmed.toUpperCase().startsWith("SIDEBOARD:")) {
    return "SIDEBOARD";
  }

  // Check for foil marker and remove it
  const isFoil = trimmed.endsWith("*F*");
  const lineWithoutFoil = isFoil ? trimmed.slice(0, -3).trim() : trimmed;

  // Parse format: {quantity} {card name} ({setCode}) {collectorNumber}
  // Use regex to match the pattern from the end (more reliable due to complex card names)
  // Pattern explanation:
  // ^(\d+)\s+       - quantity at start
  // (.+?)           - card name (non-greedy)
  // \s+\(([^)]+)\)  - set code in parentheses
  // \s+(\S+)$       - collector number at end
  const regex = /^(\d+)\s+(.+?)\s+\(([^)]+)\)\s+(\S+)$/;
  const match = lineWithoutFoil.match(regex);

  if (!match) {
    throw new Error(`Invalid format: expected "{quantity} {name} ({setCode}) {collectorNumber}"`);
  }

  const [, quantityStr, name, setCode, collectorNumber] = match;

  const quantity = Number.parseInt(quantityStr ?? "1", 10);
  if (Number.isNaN(quantity) || quantity < 1) {
    throw new Error(`Invalid quantity: ${quantityStr}`);
  }

  return {
    name: name?.trim() ?? "",
    setCode: setCode?.toUpperCase() ?? "",
    collectorNumber: collectorNumber ?? "",
    quantity,
    isFoil,
  };
}

/**
 * Parse Moxfield text content
 *
 * Parses the main deck and skips the sideboard section for now.
 */
export function parseMoxfieldText(content: string): MoxfieldParseResult {
  const lines = content.split(/\r?\n/);

  const rows: MoxfieldRow[] = [];
  const errors: MoxfieldParseResult["errors"] = [];
  let totalQuantity = 0;
  let sideboardSkipped = 0;
  let inSideboard = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    try {
      const result = parseMoxfieldLine(line);

      if (result === "SIDEBOARD") {
        inSideboard = true;
        continue;
      }

      if (result === null) {
        continue; // Skip empty lines
      }

      if (inSideboard) {
        sideboardSkipped++;
        continue;
      }

      rows.push(result);
      totalQuantity += result.quantity;
    } catch (e) {
      // Only report errors for non-empty lines
      if (line.trim()) {
        errors.push({
          rowNumber: i + 1,
          error: e instanceof Error ? e.message : "Parse error",
          rawData: line,
        });
      }
    }
  }

  return {
    success: errors.length === 0 && rows.length > 0,
    rows,
    errors,
    stats: {
      totalRows: lines.filter((l) => l.trim()).length,
      successCount: rows.length,
      errorCount: errors.length,
      totalQuantity,
      sideboardSkipped,
    },
  };
}
