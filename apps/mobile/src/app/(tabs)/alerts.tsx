import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAlerts, useMarkAlertRead, useRemoveWatch } from '@/api/queries';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatPrice, formatRelativeTime } from '@/lib/price';
import {
  getPushPermissionStatus,
  registerForPriceAlerts,
  type PushPermissionStatus,
} from '@/lib/push-registration';

const SAVINGS_GREEN = '#16a34a';

export default function AlertsScreen() {
  const theme = useTheme();
  const [permissionStatus, setPermissionStatus] =
    useState<PushPermissionStatus>('undetermined');
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const alertsQuery = useAlerts(permissionStatus === 'granted');
  const markAlertRead = useMarkAlertRead();
  const removeWatch = useRemoveWatch();

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
        (first, second) =>
          new Date(second.capturedAt).getTime() - new Date(first.capturedAt).getTime(),
      ),
    [alertsQuery.data?.alerts],
  );
  const watches = alertsQuery.data?.watches ?? [];
  const isPermissionReady = permissionStatus === 'granted';

  const handleEnableAlerts = async () => {
    setIsRegistering(true);
    setPermissionMessage(null);

    const result = await registerForPriceAlerts();
    setIsRegistering(false);

    if (result.status === 'registered') {
      setPermissionStatus('granted');
      setPermissionMessage(null);
      await alertsQuery.refetch();
      return;
    }

    setPermissionStatus(result.status === 'denied' ? 'denied' : 'unsupported');
    setPermissionMessage(result.message);
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
            <ThemedText type="smallBold" themeColor="accent">
              Price Alerts
            </ThemedText>
            <ThemedText type="subtitle">Watch for grocery drops</ThemedText>
          </View>

          {!isPermissionReady ? (
            <PermissionCard
              disabled={isRegistering}
              message={permissionMessage}
              permissionStatus={permissionStatus}
              onEnable={handleEnableAlerts}
            />
          ) : alertsQuery.isLoading ? (
            <LoadingState />
          ) : alertsQuery.isError ? (
            <MessageState
              title="Could not load alerts"
              message="Pull to refresh or try reopening Cartwise."
            />
          ) : (
            <>
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <ThemedText type="smallBold">Recent drops</ThemedText>
                  {alerts.length > 0 ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {alerts.length}
                    </ThemedText>
                  ) : null}
                </View>

                {alerts.length === 0 ? (
                  <MessageState
                    title="No price drops yet"
                    message="No price drops yet - finalize a cart to start watching prices."
                  />
                ) : (
                  <View style={styles.stack}>
                    {alerts.map((alert) => (
                      <Pressable
                        key={alert.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Mark ${alert.productName} price drop as read`}
                        disabled={markAlertRead.isPending}
                        onPress={() => {
                          if (!alert.read) {
                            markAlertRead.mutate(alert.id);
                          }
                        }}
                        style={({ pressed }) => [
                          pressed && styles.pressed,
                          markAlertRead.isPending && styles.disabled,
                        ]}>
                        <ThemedView type="backgroundElement" style={styles.alertCard}>
                          <View style={styles.alertCopy}>
                            <View style={styles.alertTitleRow}>
                              {!alert.read ? (
                                <View
                                  accessibilityLabel="Unread alert"
                                  style={[styles.unreadDot, { backgroundColor: theme.accent }]}
                                />
                              ) : null}
                              <ThemedText type="smallBold" style={styles.alertTitle}>
                                {alert.productName}
                              </ThemedText>
                            </View>
                            <ThemedText type="small" themeColor="textSecondary">
                              {alert.storeName}
                            </ThemedText>
                            <ThemedText type="smallBold" style={styles.priceDropText}>
                              was {formatPrice(alert.oldPrice)} {'\u2192'} now{' '}
                              <ThemedText type="smallBold" style={styles.savingsText}>
                                {formatPrice(alert.newPrice)}
                              </ThemedText>
                            </ThemedText>
                          </View>
                          <ThemedText type="small" themeColor="textSecondary" style={styles.timeText}>
                            {formatRelativeTime(alert.capturedAt)}
                          </ThemedText>
                        </ThemedView>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <ThemedText type="smallBold">Watched items</ThemedText>
                  {watches.length > 0 ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {watches.length}
                    </ThemedText>
                  ) : null}
                </View>

                {watches.length === 0 ? (
                  <MessageState
                    title="No watched items"
                    message="Finalize a cart to watch those items for future drops."
                  />
                ) : (
                  <View style={styles.stack}>
                    {watches.map((watch) => (
                      <ThemedView key={watch.id} type="backgroundElement" style={styles.watchCard}>
                        <View style={styles.watchCopy}>
                          <ThemedText type="smallBold">{watch.productName}</ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            Baseline {formatPrice(watch.baselinePrice)} across{' '}
                            {watch.storeIds.length} stores
                          </ThemedText>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${watch.productName} from watched items`}
                          disabled={removeWatch.isPending}
                          hitSlop={8}
                          onPress={() => handleRemoveWatch(watch.id, watch.productName)}
                          style={({ pressed }) => [
                            styles.removeButton,
                            pressed && styles.pressed,
                            removeWatch.isPending && styles.disabled,
                          ]}>
                          <ThemedText type="smallBold" themeColor="danger">
                            Remove
                          </ThemedText>
                        </Pressable>
                      </ThemedView>
                    ))}
                  </View>
                )}
              </View>
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
    <ThemedView type="backgroundElement" style={styles.permissionCard}>
      <View style={styles.permissionCopy}>
        <ThemedText type="smallBold">Get notified when prices drop on items you buy</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Cartwise can watch finalized cart items and let you know when nearby stores lower the
          price.
        </ThemedText>
        {statusMessage ? (
          <ThemedText type="small" themeColor={isDenied || isUnsupported ? 'danger' : 'textSecondary'}>
            {statusMessage}
          </ThemedText>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={disabled || isUnsupported}
        onPress={onEnable}
        style={({ pressed }) => [
          styles.primaryButton,
          { backgroundColor: theme.accent },
          pressed && styles.pressed,
          (disabled || isUnsupported) && styles.disabled,
        ]}>
        {disabled ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <ThemedText type="smallBold" style={styles.primaryButtonText}>
            Enable price alerts
          </ThemedText>
        )}
      </Pressable>
    </ThemedView>
  );
}

function LoadingState() {
  return (
    <ThemedView type="backgroundElement" style={styles.messageState}>
      <ActivityIndicator color={SAVINGS_GREEN} />
    </ThemedView>
  );
}

function MessageState({ title, message }: { title: string; message: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.messageState}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.messageText}>
        {message}
      </ThemedText>
    </ThemedView>
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
    gap: Spacing.two,
  },
  section: {
    gap: Spacing.three,
  },
  sectionHeader: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stack: {
    gap: Spacing.three,
  },
  permissionCard: {
    borderRadius: 8,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  permissionCopy: {
    gap: Spacing.two,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  primaryButtonText: {
    color: '#ffffff',
  },
  alertCard: {
    borderRadius: 8,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  alertCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  alertTitleRow: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  alertTitle: {
    flex: 1,
  },
  priceDropText: {
    marginTop: Spacing.one,
  },
  savingsText: {
    color: SAVINGS_GREEN,
  },
  timeText: {
    textAlign: 'right',
  },
  watchCard: {
    borderRadius: 8,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  watchCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  removeButton: {
    minHeight: 36,
    justifyContent: 'center',
  },
  messageState: {
    minHeight: 160,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.one,
  },
  messageText: {
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.5,
  },
});
