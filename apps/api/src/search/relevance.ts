import type { Product } from "@cartwise/shared";

import type { CollectedProduct } from "../collectors/types.js";

type SearchableProduct = Pick<Product | CollectedProduct, "brand" | "category" | "name">;

export const SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

const EGG_DENY_TOKENS = new Set([
  "bacon",
  "bagel",
  "bite",
  "bites",
  "candy",
  "cheese",
  "chocolate",
  "cooker",
  "croissant",
  "dash",
  "eggo",
  "frittata",
  "kinder",
  "lunchable",
  "mac",
  "noodle",
  "pancake",
  "salad",
  "sandwich",
  "sausage",
  "waffle",
]);

const EGG_ALLOW_TOKENS = new Set([
  "brown",
  "cage",
  "cooked",
  "egg",
  "free",
  "grade",
  "hard",
  "jumbo",
  "large",
  "liquid",
  "medium",
  "organic",
  "pasture",
  "range",
  "shell",
  "white",
]);

export function searchRelevanceScore(query: string, product: SearchableProduct): number | null {
  const queryTokens = tokenizeSearchText(query).filter((token) => !SEARCH_STOP_WORDS.has(token));
  if (queryTokens.length === 0) {
    return null;
  }

  const nameTokens = tokenizeSearchText(product.name);
  const brandTokens = tokenizeSearchText(product.brand ?? "");
  const categoryTokens = tokenizeSearchText(product.category ?? "");
  const allTokens = new Set([...nameTokens, ...brandTokens, ...categoryTokens]);

  if (!queryTokens.every((token) => allTokens.has(token))) {
    return null;
  }

  if (isEggQuery(queryTokens) && !isRelevantEggProduct(nameTokens, brandTokens, categoryTokens)) {
    return null;
  }

  const normalizedName = normalizeSearchText(product.name);
  const normalizedQuery = normalizeSearchText(query);
  let score = 0;

  if (normalizedName === normalizedQuery) {
    score += 120;
  } else if (normalizedName.startsWith(`${normalizedQuery} `)) {
    score += 80;
  } else if (normalizedName.includes(normalizedQuery)) {
    score += 50;
  }

  for (const token of queryTokens) {
    if (nameTokens.includes(token)) {
      score += 25;
    }
    if (categoryTokens.includes(token)) {
      score += 8;
    }
    if (brandTokens.includes(token)) {
      score += 4;
    }
  }

  if (isEggQuery(queryTokens)) {
    score += 40;
  }

  return score;
}

export function compareSearchableProducts(query: string, left: SearchableProduct, right: SearchableProduct) {
  return (
    (searchRelevanceScore(query, right) ?? 0) - (searchRelevanceScore(query, left) ?? 0) ||
    left.name.localeCompare(right.name)
  );
}

function isEggQuery(queryTokens: string[]): boolean {
  return queryTokens.length === 1 && queryTokens[0] === "egg";
}

function isRelevantEggProduct(
  nameTokens: string[],
  brandTokens: string[],
  categoryTokens: string[],
): boolean {
  const tokens = new Set([...nameTokens, ...brandTokens, ...categoryTokens]);

  if (!tokens.has("egg")) {
    return false;
  }

  for (const token of tokens) {
    if (EGG_DENY_TOKENS.has(token)) {
      return false;
    }
  }

  return [...tokens].some((token) => EGG_ALLOW_TOKENS.has(token));
}

export function tokenizeSearchText(value: string): string[] {
  const normalized = normalizeSearchText(value);
  const rawTokens = normalized.match(/[a-z0-9]+/g) ?? [];

  return rawTokens.map(stemToken).filter((token) => token.length > 1);
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stemToken(token: string): string {
  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.endsWith("oes") && token.length > 4) {
    return token.slice(0, -2);
  }

  if (/(ches|shes|sses|xes|zes)$/.test(token) && token.length > 4) {
    return token.slice(0, -2);
  }

  if (token.endsWith("s") && token.length > 3 && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }

  return token;
}
