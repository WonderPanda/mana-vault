/**
 * ManaBox CSV Parser
 *
 * Parses CSV exports from the ManaBox app.
 *
 * Expected columns:
 * Name, Set code, Set name, Collector number, Foil, Rarity, Quantity,
 * ManaBox ID, Scryfall ID, Purchase price, Misprint, Altered, Condition,
 * Language, Purchase price currency
 */

export interface ManaBoxRow {
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  foil: "normal" | "foil" | "etched";
  rarity: string;
  quantity: number;
  manaboxId: string;
  scryfallId: string;
  purchasePrice: number | null;
  misprint: boolean;
  altered: boolean;
  condition: "mint" | "near_mint" | "excellent" | "good" | "light_played" | "played" | "poor";
  language: string;
  purchasePriceCurrency: string | null;
}

export interface ParseResult {
  success: boolean;
  rows: ManaBoxRow[];
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
  };
}

/**
 * Map ManaBox condition strings to our database condition format
 */
export function mapCondition(condition: string): "M" | "NM" | "LP" | "MP" | "HP" | "DMG" {
  const normalized = condition.toLowerCase().trim();
  switch (normalized) {
    case "mint":
      return "M";
    case "near_mint":
    case "nearmint":
    case "nm":
      return "NM";
    case "excellent":
    case "light_played":
    case "lightplayed":
    case "lp":
      return "LP";
    case "good":
    case "played":
    case "mp":
      return "MP";
    case "poor":
    case "hp":
      return "HP";
    default:
      return "NM"; // Default to NM if unknown
  }
}

/**
 * Parse a single CSV line, handling quoted fields properly
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  // Don't forget the last field
  fields.push(current.trim());

  return fields;
}

/**
 * Parse ManaBox CSV content
 */
export function parseManaBoxCSV(csvContent: string): ParseResult {
  const lines = csvContent.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length === 0) {
    return {
      success: false,
      rows: [],
      errors: [{ rowNumber: 0, error: "Empty CSV content", rawData: "" }],
      stats: { totalRows: 0, successCount: 0, errorCount: 1, totalQuantity: 0 },
    };
  }

  // Parse header to get column indices
  const headerLine = lines[0];
  if (!headerLine) {
    return {
      success: false,
      rows: [],
      errors: [{ rowNumber: 0, error: "Missing header row", rawData: "" }],
      stats: { totalRows: 0, successCount: 0, errorCount: 1, totalQuantity: 0 },
    };
  }
  const headers = parseCSVLine(headerLine).map((h) => h.toLowerCase().replace(/\s+/g, "_"));

  // Map expected column names to indices
  const columnMap: Record<string, number> = {};
  const expectedColumns = [
    "name",
    "set_code",
    "set_name",
    "collector_number",
    "foil",
    "rarity",
    "quantity",
    "manabox_id",
    "scryfall_id",
    "purchase_price",
    "misprint",
    "altered",
    "condition",
    "language",
    "purchase_price_currency",
  ];

  for (const col of expectedColumns) {
    const index = headers.indexOf(col);
    if (index !== -1) {
      columnMap[col] = index;
    }
  }

  // Verify required columns exist
  const requiredColumns = ["name", "scryfall_id", "quantity"];
  const missingColumns = requiredColumns.filter((col) => !(col in columnMap));
  if (missingColumns.length > 0) {
    return {
      success: false,
      rows: [],
      errors: [
        {
          rowNumber: 0,
          error: `Missing required columns: ${missingColumns.join(", ")}`,
          rawData: headerLine,
        },
      ],
      stats: { totalRows: 0, successCount: 0, errorCount: 1, totalQuantity: 0 },
    };
  }

  const rows: ManaBoxRow[] = [];
  const errors: ParseResult["errors"] = [];
  let totalQuantity = 0;

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;

    try {
      const fields = parseCSVLine(line);

      const getValue = (col: string): string => {
        const index = columnMap[col];
        return index !== undefined ? (fields[index] ?? "") : "";
      };

      const quantity = Number.parseInt(getValue("quantity"), 10) || 1;

      const row: ManaBoxRow = {
        name: getValue("name"),
        setCode: getValue("set_code"),
        setName: getValue("set_name"),
        collectorNumber: getValue("collector_number"),
        foil:
          getValue("foil") === "foil"
            ? "foil"
            : getValue("foil") === "etched"
              ? "etched"
              : "normal",
        rarity: getValue("rarity"),
        quantity,
        manaboxId: getValue("manabox_id"),
        scryfallId: getValue("scryfall_id"),
        purchasePrice: getValue("purchase_price")
          ? Number.parseFloat(getValue("purchase_price"))
          : null,
        misprint: getValue("misprint").toUpperCase() === "TRUE",
        altered: getValue("altered").toUpperCase() === "TRUE",
        condition: getValue("condition") as ManaBoxRow["condition"],
        language: getValue("language") || "en",
        purchasePriceCurrency: getValue("purchase_price_currency") || null,
      };

      // Validate required fields
      if (!row.name) {
        errors.push({ rowNumber: i + 1, error: "Missing card name", rawData: line });
        continue;
      }
      if (!row.scryfallId) {
        errors.push({ rowNumber: i + 1, error: "Missing Scryfall ID", rawData: line });
        continue;
      }

      rows.push(row);
      totalQuantity += quantity;
    } catch (e) {
      errors.push({
        rowNumber: i + 1,
        error: e instanceof Error ? e.message : "Parse error",
        rawData: line,
      });
    }
  }

  return {
    success: errors.length === 0,
    rows,
    errors,
    stats: {
      totalRows: lines.length - 1, // Exclude header
      successCount: rows.length,
      errorCount: errors.length,
      totalQuantity,
    },
  };
}
