import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InsertProductInput, ProductRow } from "./repository.js";

const { fakeDb, fakeState } = vi.hoisted(() => {
  interface FakeState {
    rowsByUpc: Map<string, ProductRow>;
    insertAttempts: number;
  }

  const fakeState: FakeState = {
    rowsByUpc: new Map(),
    insertAttempts: 0,
  };

  const fakeDb = {
    insert() {
      let input: InsertProductInput | null = null;

      return {
        values(value: InsertProductInput) {
          input = value;
          return this;
        },
        onConflictDoNothing() {
          return this;
        },
        async returning() {
          if (!input) {
            throw new Error("insert values missing");
          }

          fakeState.insertAttempts += 1;
          if (input.upc && fakeState.rowsByUpc.has(input.upc)) {
            return [];
          }

          const row: ProductRow = {
            id: `product-${fakeState.rowsByUpc.size + 1}`,
            ...input,
          };
          if (input.upc) {
            fakeState.rowsByUpc.set(input.upc, row);
          }
          return [row];
        },
      };
    },
    select() {
      return {
        from() {
          return this;
        },
        where() {
          return this;
        },
        async limit() {
          return Array.from(fakeState.rowsByUpc.values()).slice(0, 1);
        },
      };
    },
    update() {
      let setValues: Partial<ProductRow> | null = null;

      return {
        set(values: Partial<ProductRow>) {
          setValues = values;
          return this;
        },
        where() {
          return this;
        },
        async returning() {
          const updated: ProductRow[] = [];
          for (const [upc, row] of fakeState.rowsByUpc) {
            if (row.imageUrl === null && setValues?.imageUrl) {
              const next = { ...row, ...setValues };
              fakeState.rowsByUpc.set(upc, next);
              updated.push(next);
            }
          }
          return updated.slice(0, 1);
        },
      };
    },
    async transaction<T>(this: unknown, callback: (tx: unknown) => Promise<T>): Promise<T> {
      return callback(this);
    },
    async execute() {
      return undefined;
    },
  };

  return { fakeDb, fakeState };
});

vi.mock("./client.js", () => ({ db: fakeDb }));

const { cartwiseDb } = await import("./repository.js");

describe("cartwiseDb.insertProduct", () => {
  beforeEach(() => {
    fakeState.rowsByUpc.clear();
    fakeState.insertAttempts = 0;
  });

  it("converges concurrent inserts for the same UPC onto one product row", async () => {
    const input: InsertProductInput = {
      name: "Whole Milk",
      brand: "Store",
      sizeQty: 1,
      sizeUnit: "gal",
      upc: "000111222333",
      category: "dairy",
      imageUrl: null,
    };

    const [first, second] = await Promise.all([
      cartwiseDb.insertProduct(input),
      cartwiseDb.insertProduct(input),
    ]);

    expect(first).toEqual(second);
    expect(fakeState.rowsByUpc.size).toBe(1);
    expect(fakeState.insertAttempts).toBe(2);
  });

  it("backfills a missing image when a later collection carries one", async () => {
    const input: InsertProductInput = {
      name: "Whole Milk",
      brand: "Store",
      sizeQty: 1,
      sizeUnit: "gal",
      upc: "000111222333",
      category: "dairy",
      imageUrl: null,
    };

    await cartwiseDb.insertProduct(input);
    const result = await cartwiseDb.insertProduct({
      ...input,
      imageUrl: "https://img.example/milk.jpg",
    });

    expect(result.imageUrl).toBe("https://img.example/milk.jpg");
    expect(fakeState.rowsByUpc.get(input.upc as string)?.imageUrl).toBe(
      "https://img.example/milk.jpg",
    );
  });

  it("never overwrites an existing product image", async () => {
    const input: InsertProductInput = {
      name: "Whole Milk",
      brand: "Store",
      sizeQty: 1,
      sizeUnit: "gal",
      upc: "000111222333",
      category: "dairy",
      imageUrl: "https://img.example/original.jpg",
    };

    await cartwiseDb.insertProduct(input);
    const result = await cartwiseDb.insertProduct({
      ...input,
      imageUrl: "https://img.example/other.jpg",
    });

    expect(result.imageUrl).toBe("https://img.example/original.jpg");
  });
});
