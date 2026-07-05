import type { ChainSlug } from "@cartwise/shared";

import { createCache, type Cache } from "../cache.js";
import type { CollectedProduct, Collector } from "../collectors/types.js";
import type {
  AlertWithDetails,
  CartwiseDb,
  LatestProductStorePriceRow,
  WatchWithProduct,
} from "../db/repository.js";
import { sendPriceDropPush, type PriceDropPushInfo } from "../push.js";

const PRICES_TTL_SECONDS = 6 * 60 * 60;

export interface RefreshWatchesDeps {
  db: CartwiseDb;
  getCollector(chain: ChainSlug): Collector | null;
  cache?: Cache;
  now?: () => Date;
  sendPush?: (token: string, alertInfo: PriceDropPushInfo) => Promise<void>;
  logger?: {
    error(...args: unknown[]): void;
  };
}

export interface RefreshWatchesResult {
  checked: number;
  alerts: number;
  errors: Array<{ watchId: string; message: string }>;
}

interface RefreshRow {
  row: LatestProductStorePriceRow;
  watchId: string;
}

export async function refreshWatches(deps: RefreshWatchesDeps): Promise<RefreshWatchesResult> {
  const cache = deps.cache ?? createCache(deps.db);
  const now = deps.now ?? (() => new Date());
  const sendPush = deps.sendPush ?? ((token, alertInfo) => sendPriceDropPush({}, token, alertInfo));
  const errors: RefreshWatchesResult["errors"] = [];
  const watches = await deps.db.getActiveWatches();
  const rowsToRefresh: RefreshRow[] = [];

  await retryUnsentAlerts(deps.db, watches, sendPush, now, errors, deps.logger);

  for (const watch of watches) {
    try {
      const rows = await deps.db.getLatestPricesForProducts([watch.productId], watch.storeIds);
      rowsToRefresh.push(...rows.map((row) => ({ row, watchId: watch.id })));
    } catch (error) {
      recordWatchError(errors, deps.logger, watch.id, error);
    }
  }

  await refreshLatestPrices(deps.db, deps.getCollector, cache, rowsToRefresh, errors, deps.logger);

  let alertCount = 0;
  for (const watch of watches) {
    try {
      const rows = await deps.db.getLatestPricesForProducts([watch.productId], watch.storeIds);
      const best = cheapestPriceRow(rows);
      if (!best?.price || !isPriceDrop(watch.baselinePrice, effectivePrice(best.price))) {
        continue;
      }

      const oldPrice = watch.baselinePrice;
      const newPrice = effectivePrice(best.price);
      const existingAlert = await findAlertForDrop(deps.db, watch, newPrice);
      if (existingAlert) {
        await deps.db.updateWatchBaseline(watch.id, newPrice);
        continue;
      }

      const alert = await deps.db.insertAlertAndUpdateWatchBaseline(
        {
          watchId: watch.id,
          storeId: best.storeId,
          oldPrice,
          newPrice,
          capturedAt: best.price.capturedAt,
        },
        newPrice,
      );
      alertCount += 1;

      const pushToken = await deps.db.getPushTokenForDevice(watch.deviceId);
      if (!pushToken) {
        continue;
      }

      await sendPush(pushToken.expoPushToken, {
        product: watch.product.name,
        store: best.store.name,
        oldPrice,
        newPrice,
      });
      await deps.db.markAlertSent(alert.id, now());
    } catch (error) {
      recordWatchError(errors, deps.logger, watch.id, error);
    }
  }

  return { checked: watches.length, alerts: alertCount, errors };
}

async function retryUnsentAlerts(
  db: CartwiseDb,
  watches: WatchWithProduct[],
  sendPush: (token: string, alertInfo: PriceDropPushInfo) => Promise<void>,
  now: () => Date,
  errors: RefreshWatchesResult["errors"],
  logger: RefreshWatchesDeps["logger"],
): Promise<void> {
  for (const watch of watches) {
    try {
      const watchAlerts = (await db.listAlertsForDevice(watch.deviceId)).filter(
        (alert) => alert.watchId === watch.id,
      );
      const sentDropKeys = new Set(
        watchAlerts.filter((alert) => alert.sentAt).map((alert) => alertDropKey(alert)),
      );
      const unsentAlerts = watchAlerts
        .filter((alert) => !alert.sentAt)
        .sort((left, right) => left.capturedAt.getTime() - right.capturedAt.getTime());
      if (unsentAlerts.length === 0) {
        continue;
      }

      const pushToken = await db.getPushTokenForDevice(watch.deviceId);

      for (const alert of unsentAlerts) {
        const dropKey = alertDropKey(alert);
        if (!sentDropKeys.has(dropKey)) {
          if (!pushToken) {
            continue;
          }

          await sendPush(pushToken.expoPushToken, alertToPushInfo(alert));
          sentDropKeys.add(dropKey);
        }

        await db.markAlertSent(alert.id, now());
      }
    } catch (error) {
      recordWatchError(errors, logger, watch.id, error);
    }
  }
}

async function findAlertForDrop(
  db: CartwiseDb,
  watch: WatchWithProduct,
  newPrice: number,
): Promise<AlertWithDetails | null> {
  const newPriceCents = moneyToCents(newPrice);
  return (
    (await db.listAlertsForDevice(watch.deviceId)).find(
      (alert) => alert.watchId === watch.id && moneyToCents(alert.newPrice) === newPriceCents,
    ) ?? null
  );
}

async function refreshLatestPrices(
  db: CartwiseDb,
  getCollector: (chain: ChainSlug) => Collector | null,
  cache: Cache,
  rowsToRefresh: RefreshRow[],
  errors: RefreshWatchesResult["errors"],
  logger: RefreshWatchesDeps["logger"],
): Promise<void> {
  const groups = groupRowsByCollectorCall(rowsToRefresh);

  for (const group of groups.values()) {
    const collector = getCollector(group.chain);
    if (!collector) {
      continue;
    }

    try {
      const externalProductIds = Array.from(
        new Set(group.rows.map(({ row }) => row.externalProductId)),
      ).sort();
      await cache.withCache(
        `price:${group.chain}:${group.externalLocationId}:${externalProductIds.join(",")}`,
        PRICES_TTL_SECONDS,
        async () => {
          const collectedProducts = (
            await collector.getPrices(externalProductIds, group.externalLocationId)
          ).map(normalizeCollectedProductDates);
          const collectedById = new Map(
            collectedProducts.map((product) => [product.externalProductId, product]),
          );

          for (const { row } of group.rows) {
            const collected = collectedById.get(row.externalProductId);
            if (!collected || collected.price === null) {
              continue;
            }

            await db.insertPriceSnapshot({
              storeProductId: row.storeProductId,
              price: collected.price,
              promoPrice: collected.promoPrice,
              capturedAt: collected.capturedAt,
              source: row.store.chainSlug,
            });
          }

          return collectedProducts;
        },
      );
    } catch (error) {
      for (const watchId of new Set(group.rows.map((row) => row.watchId))) {
        recordWatchError(errors, logger, watchId, error);
      }
    }
  }
}

function groupRowsByCollectorCall(rowsToRefresh: RefreshRow[]): Map<
  string,
  {
    chain: ChainSlug;
    externalLocationId: string;
    rows: RefreshRow[];
  }
> {
  const groups = new Map<
    string,
    {
      chain: ChainSlug;
      externalLocationId: string;
      rows: RefreshRow[];
    }
  >();

  for (const refreshRow of rowsToRefresh) {
    const key = `${refreshRow.row.store.chainSlug}:${refreshRow.row.store.externalLocationId}`;
    const existing =
      groups.get(key) ??
      {
        chain: refreshRow.row.store.chainSlug,
        externalLocationId: refreshRow.row.store.externalLocationId,
        rows: [],
      };
    existing.rows.push(refreshRow);
    groups.set(key, existing);
  }

  return groups;
}

function cheapestPriceRow(rows: LatestProductStorePriceRow[]): LatestProductStorePriceRow | null {
  return (
    rows
      .filter((row) => row.price !== null && row.price.price !== null)
      .sort((left, right) => effectivePrice(left.price!) - effectivePrice(right.price!))[0] ?? null
  );
}

export function isPriceDrop(baselinePrice: number, newPrice: number): boolean {
  const baselineCents = moneyToCents(baselinePrice);
  const newCents = moneyToCents(newPrice);
  const thresholdCents = Math.max(100, Math.round(baselineCents * 0.1));
  return newCents <= baselineCents - thresholdCents;
}

function effectivePrice(price: { price: number | null; promoPrice: number | null }): number {
  return price.promoPrice ?? price.price ?? Number.POSITIVE_INFINITY;
}

function alertToPushInfo(alert: AlertWithDetails): PriceDropPushInfo {
  return {
    product: alert.product.name,
    store: alert.store.name,
    oldPrice: alert.oldPrice,
    newPrice: alert.newPrice,
  };
}

function alertDropKey(alert: Pick<AlertWithDetails, "watchId" | "newPrice">): string {
  return `${alert.watchId}:${moneyToCents(alert.newPrice)}`;
}

function moneyToCents(value: number): number {
  return Math.round(value * 100);
}

function normalizeCollectedProductDates(collected: CollectedProduct): CollectedProduct {
  return {
    ...collected,
    capturedAt:
      collected.capturedAt instanceof Date ? collected.capturedAt : new Date(collected.capturedAt),
  };
}

function recordWatchError(
  errors: RefreshWatchesResult["errors"],
  logger: RefreshWatchesDeps["logger"],
  watchId: string,
  error: unknown,
): void {
  const message = error instanceof Error ? error.message : "Unknown watch refresh error";
  errors.push({ watchId, message });
  logger?.error({ watchId, error }, "Watch refresh failed");
}
