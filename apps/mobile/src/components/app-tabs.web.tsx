import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  type TabTriggerSlotProps,
  type TabListProps,
} from 'expo-router/ui';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useCurrentCart } from '@/api/queries';
import { ThemedText } from '@/components/themed-text';
import { Elevation, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tapLight } from '@/lib/haptics';

const icons = {
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  cart: { ios: 'cart', android: 'shopping_cart', web: 'shopping_cart' },
  alerts: { ios: 'bell', android: 'notifications', web: 'notifications' },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
} satisfies Record<string, SymbolViewProps['name']>;

export default function AppTabs() {
  const cartQuery = useCurrentCart();
  const cartItemCount =
    cartQuery.data?.cart.items.reduce((sum, item) => sum + item.qty, 0) ?? 0;

  return (
    <Tabs>
      <TabSlot style={styles.tabSlot} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton icon={icons.search}>Search</TabButton>
          </TabTrigger>
          <TabTrigger name="cart" href="/cart" asChild>
            <TabButton icon={icons.cart} badge={cartItemCount}>
              Cart
            </TabButton>
          </TabTrigger>
          <TabTrigger name="alerts" href="/alerts" asChild>
            <TabButton icon={icons.alerts}>Alerts</TabButton>
          </TabTrigger>
          <TabTrigger name="settings" href="/settings" asChild>
            <TabButton icon={icons.settings}>Settings</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({
  children,
  isFocused,
  badge = 0,
  icon,
  onPress,
  ...props
}: TabTriggerSlotProps & { badge?: number; icon: SymbolViewProps['name'] }) {
  const theme = useTheme();
  const tint = isFocused ? theme.accent : theme.textSecondary;
  const label = typeof children === 'string' ? children : undefined;

  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(isFocused) }}
      onPress={(event) => {
        tapLight();
        onPress?.(event);
      }}
      style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}>
      <View style={styles.iconSlot}>
        <SymbolView name={icon} tintColor={tint} size={24} />
        {badge > 0 ? (
          <View style={[styles.badge, { backgroundColor: theme.accent }]}>
            <ThemedText type="caption" themeColor="onAccent" style={styles.badgeText}>
              {badge}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <ThemedText
        type="caption"
        themeColor={isFocused ? 'accent' : 'textSecondary'}
        style={styles.label}>
        {children}
      </ThemedText>
    </Pressable>
  );
}

export function CustomTabList({ children, style, ...props }: TabListProps) {
  const theme = useTheme();

  return (
    <View {...props} style={[styles.tabListContainer, style]}>
      <View
        style={[
          styles.innerContainer,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
            shadowColor: theme.shadow,
          },
        ]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabSlot: {
    height: '100%',
  },
  tabListContainer: {
    position: 'fixed' as ViewStyle['position'],
    left: 0,
    right: 0,
    bottom: 20,
    zIndex: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  innerContainer: {
    width: '100%',
    maxWidth: 480,
    height: 64,
    borderRadius: Radii.chip,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    overflow: 'hidden',
    ...Elevation.float,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  iconSlot: {
    width: 30,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontWeight: 700,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: Radii.chip,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontWeight: 700,
    fontSize: 10,
    lineHeight: 12,
  },
});
