import type { Store } from '@cartwise/shared';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import type { PriceAlert } from '@/api/client';
import { useAlerts, useMarkAlertRead, useRemoveWatch, useStores } from '@/api/queries';
import { BrandRow } from '@/components/brand-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FreshnessStamp } from '@/components/ui/freshness-stamp';
import { PressableScale } from '@/components/ui/pressable-scale';
import { PriceText } from '@/components/ui/price-text';
import { SavingsTag } from '@/components/ui/savings-tag';
import { Skeleton } from '@/components/ui/skeleton';
import { BottomTabInset, MaxContentWidth, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { entrance } from '@/lib/motion';
import { chainLabel, formatPrice } from '@/lib/price';
import {
  getPushPermissionStatus,
  registerForPriceAlerts,
  type PushPermissionStatus,
} from '@/lib/push-registration';
import { usePreferencesStore } from '@/state/preferences';

const bellIcon: SymbolViewProps['name'] = {
  ios: 'bell',
  android: 'notifications',
  web: 'notifications',
};

const warningIcon: SymbolViewProps['name'] = {
  ios: 'exclamationmark.triangle',
  android: 'warning',
  web: 'warning',
};

export default function AlertsScreen() {
  const theme = useTheme();
  const [permissionStatus, setPermissionStatus] =
    useState<PushPermissionStatus>('undetermined');
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const zip = usePreferencesStore((state) => state.zip);
  const alertsQuery = useAlerts(permissionStatus === 'granted');
  const storesQuery = useStores(zip);
  const markAlertRead = useMarkAlertRead();
  const removeWatch = useRemoveWatch();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    let isMounted = true;

    getPushPermissionStatus()
      .then((status) => {
        if (isMounted) {
          setPermissionStatus(status);
        }
      })
      .catch(() => {
        if (isMounted) {
          setPermissionStatus('undetermined');
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const alerts = useMemo(
    () =>
      [...(alertsQuery.data?.alerts ?? [])].sort(
        (first, second) => Date.parse(second.capturedAt) - Date.parse(first.capturedAt),
      ),
    [alertsQuery.data?.alerts],
  );
  const watches = alertsQuery.data?.watches ?? [];
  const storeById = useMemo(
    () => new Map((storesQuery.data?.stores ?? []).map((store) => [store.id, store])),
    [storesQuery.data?.stores],
  );
  const isPermissionReady = permissionStatus === 'granted';

  const handleEnableAlerts = async () => {
    setIsRegistering(true);
    setPermissionMessage(null);

    try {
      const result = await registerForPriceAlerts();

      if (result.status === 'registered') {
        setPermissionStatus('granted');
        setPermissionMessage(null);
        await alertsQuery.refetch();
        return;
      }

      setPermissionStatus(result.status === 'denied' ? 'denied' : 'unsupported');
      setPermissionMessage(result.message);
    } catch {
      setPermissionMessage('Cartwise could not register this device for price alerts.');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleRemoveWatch = (watchId: string, productName: string) => {
    Alert.alert('Remove watched item?', `Stop watching ${productName} for price drops.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeWatch.mutate(watchId),
      },
    ]);
  };

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          refreshControl={
            isPermissionReady ? (
              <RefreshControl
                refreshing={alertsQuery.isRefetching && !alertsQuery.isLoading}
                tintColor={theme.accent}
                onRefresh={() => alertsQuery.refetch()}
              />
            ) : undefined
          }
          contentContainerStyle={styles.content}
          style={styles.scrollView}>
          <View style={styles.header}>
            <BrandRow />
            <ThemedText type="display">Alerts</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Price drops on items you watch.
            </ThemedText>
          </View>

          {!isPermissionReady ? (
            <Animated.View entering={entrance(0, reducedMotion)}>
              <PermissionCard
                disabled={isRegistering}
                message={permissionMessage}
                permissionStatus={permissionStatus}
                onEnable={handleEnableAlerts}
              />
            </Animated.View>
          ) : alertsQuery.isLoading ? (
            <AlertsLoadingState />
          ) : alertsQuery.isError ? (
            <EmptyState
              icon={warningIcon}
              title="Could not load alerts"
              message="Pull to refresh or try reopening Cartwise."
            />
          ) : (
            <>
              <RecentDropsSection
                alerts={alerts}
                disabled={markAlertRead.isPending}
                storeById={storeById}
                onMarkRead={(alertId) => markAlertRead.mutate(alertId)}
              />
              <WatchedItemsSection
                disabled={removeWatch.isPending}
                watches={watches}
                onRemove={handleRemoveWatch}
              />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function PermissionCard({
  disabled,
  message,
  permissionStatus,
  onEnable,
}: {
  disabled: boolean;
  message: string | null;
  permissionStatus: PushPermissionStatus;
  onEnable: () => void;
}) {
  const theme = useTheme();
  const isDenied = permissionStatus === 'denied';
  const isUnsupported = permissionStatus === 'unsupported';
  const statusMessage =
    message ??
    (isDenied
      ? 'Notifications are off. Enable notifications in system settings to receive price alerts.'
      : isUnsupported
        ? 'Price alerts are available in the iOS and Android app.'
        : null);

  return (
    <Card style={styles.permissionCard}>
      <View style={[styles.iconWell, { backgroundColor: theme.accentMuted }]}>
        <SymbolView name={bellIcon} tintColor={theme.accent} size={28} />
      </View>
      <View style={styles.permissionCopy}>
        <ThemedText type="heading">Know when prices drop</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Cartwise watches items from finalized carts and tells you when a nearby store cuts the
          price.
        </ThemedText>
        {statusMessage ? (
          <ThemedText
            type="small"
            themeColor={isDenied || isUnsupported ? 'danger' : 'textSecondary'}>
            {statusMessage}
          </ThemedText>
        ) : null}
        {isDenied ? (
          <ThemedText type="caption" themeColor="textSecondary">
            Open system notification settings, allow Cartwise, then return here.
          </ThemedText>
        ) : null}
      </View>
      <AppButton
        label="Enable price alerts"
        haptic="success"
        loading={disabled}
        disabled={isUnsupported}
        onPress={onEnable}
      />
    </Card>
  );
}

function RecentDropsSection({
  alerts,
  disabled,
  storeById,
  onMarkRead,
}: {
  alerts: PriceAlert[];
  disabled: boolean;
  storeById: ReadonlyMap<string, Store>;
  onMarkRead: (alertId: string) => void;
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();

  return (
    <Animated.View entering={entrance(0, reducedMotion)} style={styles.section}>
      <SectionHeader label="RECENT DROPS" count={`${alerts.length} drops`} />

      {alerts.length === 0 ? (
        <EmptyState
          icon={bellIcon}
          title="No price drops yet"
          message="You'll hear the moment a watched price falls."
        />
      ) : (
        <Card flush>
          {alerts.map((alert, index) => {
            const savings = Math.max(0, alert.oldPrice - alert.newPrice);
            const store = storeById.get(alert.storeId);

            return (
              <PressableScale
                key={alert.id}
                accessibilityRole="button"
                accessibilityLabel={`Mark ${alert.productName} price drop as read`}
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={() => {
                  if (!alert.read) {
                    onMarkRead(alert.id);
                  }
                }}
                style={[
                  styles.dropRow,
                  index > 0 && styles.rowDivider,
                  index > 0 && { borderTopColor: theme.border },
                  disabled && styles.disabled,
                ]}>
                <View style={styles.unreadSlot}>
                  {!alert.read ? (
                    <View
                      accessibilityLabel="Unread alert"
                      style={[styles.unreadDot, { backgroundColor: theme.accent }]}
                    />
                  ) : null}
                </View>
                <View style={styles.dropCopy}>
                  <ThemedText type="smallBold" numberOfLines={2}>
                    {alert.productName}
                  </ThemedText>
                  <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                    {formatAlertStoreMeta(alert, store)}
                  </ThemedText>
                  <View style={styles.priceMovement}>
                    <PriceText value={alert.oldPrice} size="sm" strike />
                    <ThemedText type="caption" themeColor="textSecondary">
                      →
                    </ThemedText>
                    <PriceText value={alert.newPrice} size="md" color="accent" />
                    {savings > 0 ? (
                      <SavingsTag
                        size="sm"
                        holeColor="backgroundElement"
                        label={`Down ${formatPrice(savings)}`}
                      />
                    ) : null}
                  </View>
                </View>
                <View style={styles.dropTime}>
                  <FreshnessStamp capturedAt={alert.capturedAt} />
                </View>
              </PressableScale>
            );
          })}
        </Card>
      )}
    </Animated.View>
  );
}

function formatAlertStoreMeta(alert: PriceAlert, store: Store | undefined) {
  const chain = store ? chainLabel(store.chain) : alert.storeChain ? chainLabel(alert.storeChain) : null;
  const distance = store?.distanceMiles === undefined ? null : `${store.distanceMiles.toFixed(1)} mi`;

  return [alert.storeName, chain, distance].filter(Boolean).join(' · ');
}

function WatchedItemsSection({
  disabled,
  watches,
  onRemove,
}: {
  disabled: boolean;
  watches: {
    id: string;
    productName: string;
    baselinePrice: number;
    storeIds: string[];
  }[];
  onRemove: (watchId: string, productName: string) => void;
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();

  return (
    <Animated.View entering={entrance(1, reducedMotion)} style={styles.section}>
      <SectionHeader label="WATCHED ITEMS" count={`${watches.length} watched`} />

      {watches.length === 0 ? (
        <EmptyState
          icon={bellIcon}
          title="No watched items"
          message="Finalize a cart to watch those items for future drops."
        />
      ) : (
        <Card flush>
          {watches.map((watch, index) => (
            <View
              key={watch.id}
              style={[
                styles.watchRow,
                index > 0 && styles.rowDivider,
                index > 0 && { borderTopColor: theme.border },
              ]}>
              <View style={styles.watchCopy}>
                <ThemedText type="smallBold" numberOfLines={2}>
                  {watch.productName}
                </ThemedText>
                <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                  baseline {formatPrice(watch.baselinePrice)} · {watch.storeIds.length}{' '}
                  {watch.storeIds.length === 1 ? 'store' : 'stores'}
                </ThemedText>
              </View>
              <AppButton
                label="Remove"
                variant="ghost"
                disabled={disabled}
                onPress={() => onRemove(watch.id, watch.productName)}
                style={styles.removeButton}
              />
            </View>
          ))}
        </Card>
      )}
    </Animated.View>
  );
}

function AlertsLoadingState() {
  const theme = useTheme();

  return (
    <>
      <View style={styles.section}>
        <SectionHeader label="RECENT DROPS" count="loading" />
        <Card flush>
          {[0, 1, 2].map((item, index) => (
            <View
              key={item}
              style={[
                styles.skeletonRow,
                index > 0 && styles.rowDivider,
                index > 0 && { borderTopColor: theme.border },
              ]}>
              <Skeleton height={18} width="64%" />
              <Skeleton height={14} width="42%" />
              <Skeleton height={24} width="78%" />
            </View>
          ))}
        </Card>
      </View>
      <View style={styles.section}>
        <SectionHeader label="WATCHED ITEMS" count="loading" />
        <Card flush>
          {[0, 1].map((item, index) => (
            <View
              key={item}
              style={[
                styles.skeletonRow,
                index > 0 && styles.rowDivider,
                index > 0 && { borderTopColor: theme.border },
              ]}>
              <Skeleton height={18} width="58%" />
              <Skeleton height={14} width="48%" />
            </View>
          ))}
        </Card>
      </View>
    </>
  );
}

function SectionHeader({ label, count }: { label: string; count: string }) {
  return (
    <View style={styles.sectionHeader}>
      <ThemedText type="eyebrow">{label}</ThemedText>
      <ThemedText type="caption" themeColor="textSecondary">
        {count}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
  },
  scrollView: {
    width: '100%',
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.five,
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.one,
  },
  section: {
    gap: Spacing.two,
  },
  sectionHeader: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  permissionCard: {
    gap: Spacing.three,
  },
  iconWell: {
    width: 64,
    height: 64,
    borderRadius: Radii.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionCopy: {
    gap: Spacing.two,
  },
  dropRow: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  unreadSlot: {
    width: 8,
    minHeight: 20,
    alignItems: 'center',
    paddingTop: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: Radii.chip,
  },
  dropCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  priceMovement: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  dropTime: {
    minWidth: 96,
    alignItems: 'flex-end',
    paddingTop: Spacing.half,
  },
  watchRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  watchCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  removeButton: {
    minWidth: 86,
  },
  skeletonRow: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  disabled: {
    opacity: 0.5,
  },
});
