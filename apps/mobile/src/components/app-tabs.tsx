import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { type ComponentProps, useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentCart } from '@/api/queries';
import { ThemedText } from '@/components/themed-text';
import { Elevation, Motion, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tapLight } from '@/lib/haptics';

const tabConfig = {
  index: {
    title: 'Search',
    icon: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  },
  cart: {
    title: 'Cart',
    icon: { ios: 'cart', android: 'shopping_cart', web: 'shopping_cart' },
  },
  alerts: {
    title: 'Alerts',
    icon: { ios: 'bell', android: 'notifications', web: 'notifications' },
  },
  settings: {
    title: 'Settings',
    icon: { ios: 'gearshape', android: 'settings', web: 'settings' },
  },
} satisfies Record<string, { title: string; icon: SymbolViewProps['name'] }>;

type FloatingTabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>['tabBar']>
>[0] & {
  cartItemCount: number;
};

type TabItemProps = {
  title: string;
  icon: SymbolViewProps['name'];
  focused: boolean;
  badge: number;
  onPress: () => void;
  onLongPress: () => void;
};

export default function AppTabs() {
  const cartQuery = useCurrentCart();
  const cartItemCount =
    cartQuery.data?.cart.items.reduce((sum, item) => sum + item.qty, 0) ?? 0;

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} cartItemCount={cartItemCount} />}
      screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Search' }} />
      <Tabs.Screen name="cart" options={{ title: 'Cart' }} />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

export function FloatingTabBar({
  state,
  navigation,
  cartItemCount,
}: FloatingTabBarProps) {
  const theme = useTheme();
  const safeAreaInsets = useSafeAreaInsets();
  const usesGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

  const content = (
    <View style={styles.items}>
      {state.routes.map((route, index) => {
        const config = tabConfig[route.name as keyof typeof tabConfig];
        const focused = state.index === index;

        if (!config) {
          return null;
        }

        return (
          <TabItem
            key={route.key}
            title={config.title}
            icon={config.icon}
            focused={focused}
            badge={route.name === 'cart' ? cartItemCount : 0}
            onPress={() => {
              tapLight();
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            }}
            onLongPress={() => {
              navigation.emit({ type: 'tabLongPress', target: route.key });
            }}
          />
        );
      })}
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        {
          bottom: safeAreaInsets.bottom + 8,
          shadowColor: theme.shadow,
        },
      ]}>
      {usesGlass ? (
        <GlassView
          glassEffectStyle="regular"
          tintColor={theme.backgroundElement}
          style={styles.glassSurface}>
          {content}
        </GlassView>
      ) : (
        <View
          style={[
            styles.solidSurface,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}>
          {content}
        </View>
      )}
    </View>
  );
}

function TabItem({
  title,
  icon,
  focused,
  badge,
  onPress,
  onLongPress,
}: TabItemProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const iconScale = useSharedValue(1);
  const badgeScale = useSharedValue(1);
  const previousBadge = useRef(badge);

  useEffect(() => {
    if (focused && !reducedMotion) {
      iconScale.set(1);
      iconScale.set(
        withSpring(1.15, Motion.springPop, (finished) => {
          if (finished) {
            iconScale.set(withSpring(1, Motion.springPop));
          }
        })
      );
    } else {
      iconScale.set(1);
    }
  }, [focused, iconScale, reducedMotion]);

  useEffect(() => {
    if (badge > 0 && badge !== previousBadge.current && !reducedMotion) {
      badgeScale.set(0.6);
      badgeScale.set(withSpring(1, Motion.springPop));
    } else {
      badgeScale.set(1);
    }
    previousBadge.current = badge;
  }, [badge, badgeScale, reducedMotion]);

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.get() }],
  }));
  const badgeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.get() }],
  }));
  const tint = focused ? theme.accent : theme.textSecondary;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={title}
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.item}>
      <View style={styles.iconSlot}>
        <Animated.View style={iconAnimatedStyle}>
          <SymbolView name={icon} tintColor={tint} size={24} />
        </Animated.View>
        {badge > 0 ? (
          <Animated.View
            style={[
              styles.badge,
              { backgroundColor: theme.accent },
              badgeAnimatedStyle,
            ]}>
            <ThemedText type="caption" themeColor="onAccent" style={styles.badgeText}>
              {badge}
            </ThemedText>
          </Animated.View>
        ) : null}
      </View>
      <ThemedText
        type="caption"
        themeColor={focused ? 'accent' : 'textSecondary'}
        style={styles.label}>
        {title}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 64,
    borderRadius: Radii.chip,
    zIndex: 20,
    ...Elevation.float,
  },
  glassSurface: {
    flex: 1,
    borderRadius: Radii.chip,
    overflow: 'hidden',
  },
  solidSurface: {
    flex: 1,
    borderRadius: Radii.chip,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  items: {
    flex: 1,
    flexDirection: 'row',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
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
