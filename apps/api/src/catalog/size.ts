export interface ParsedSize {
  sizeQty: number;
  sizeUnit: string;
}

export interface ComparableSize {
  qty: number;
  unit: "oz" | "ml" | "floz";
}

const unitAliases = new Map<string, string>([
  ["ounce", "oz"],
  ["ounces", "oz"],
  ["oz", "oz"],
  ["fl ounce", "floz"],
  ["fl ounces", "floz"],
  ["fl oz", "floz"],
  ["floz", "floz"],
  ["fluid ounce", "floz"],
  ["fluid ounces", "floz"],
  ["gallon", "gal"],
  ["gallons", "gal"],
  ["gal", "gal"],
  ["count", "ct"],
  ["counts", "ct"],
  ["ct", "ct"],
  ["each", "ct"],
  ["ea", "ct"],
  ["pound", "lb"],
  ["pounds", "lb"],
  ["lb", "lb"],
  ["lbs", "lb"],
  ["milliliter", "ml"],
  ["milliliters", "ml"],
  ["ml", "ml"],
  ["liter", "l"],
  ["liters", "l"],
  ["l", "l"],
  ["gram", "g"],
  ["grams", "g"],
  ["g", "g"],
]);

export function parseSize(sizeRaw: string | null | undefined): ParsedSize | null {
  if (!sizeRaw) {
    return null;
  }

  const normalized = sizeRaw.trim().toLowerCase().replace(/\s+/g, " ");
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);

  if (!match || !match[2]) {
    return null;
  }

  const sizeQty = Number(match[1]);
  const unitWords = match[2].split(" ");
  const sizeUnit =
    unitAliases.get(unitWords.slice(0, 2).join(" ")) ?? unitAliases.get(unitWords[0] ?? "");

  if (!Number.isFinite(sizeQty) || !sizeUnit) {
    return null;
  }

  return { sizeQty, sizeUnit };
}

export function toComparableSize(
  sizeQty: number | null | undefined,
  sizeUnit: string | null | undefined,
): ComparableSize | null {
  if (!sizeQty || !Number.isFinite(sizeQty) || sizeQty <= 0 || !sizeUnit) {
    return null;
  }

  const normalizedUnit = unitAliases.get(sizeUnit.trim().toLowerCase()) ?? sizeUnit.trim().toLowerCase();

  if (normalizedUnit === "oz") {
    return { qty: sizeQty, unit: "oz" };
  }

  if (normalizedUnit === "lb") {
    return { qty: sizeQty * 16, unit: "oz" };
  }

  if (normalizedUnit === "ml") {
    return { qty: sizeQty, unit: "ml" };
  }

  if (normalizedUnit === "l") {
    return { qty: sizeQty * 1_000, unit: "ml" };
  }

  if (normalizedUnit === "floz") {
    return { qty: sizeQty, unit: "floz" };
  }

  if (normalizedUnit === "gal") {
    return { qty: sizeQty * 128, unit: "floz" };
  }

  return null;
}
