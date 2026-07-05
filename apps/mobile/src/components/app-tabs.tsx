import { Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { useCurrentCart } from '@/api/queries';
import { useTheme } from '@/hooks/use-theme';

const icons: Record<string, SymbolViewProps['name']> = {
  index: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  cart: { ios: 'cart', android: 'shopping_cart', web: 'shopping_cart' },
  alerts: { ios: 'bell', android: 'notifications', web: 'notifications' },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
};

export default function AppTabs() {
  const colors = useTheme();
  const cartQuery = useCurrentCart();
  const cartItemCount =
    cartQuery.data?.cart.items.reduce((sum, item) => sum + item.qty, 0) ?? 0;

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.backgroundElement,
          borderTopColor: colors.border,
        },
        tabBarBadgeStyle: {
          backgroundColor: colors.accent,
          color: colors.onAccent,
        },
        tabBarIcon: ({ color, size }) => (
          <SymbolView name={icons[route.name]} tintColor={color} size={size} />
        ),
      })}>
      <Tabs.Screen name="index" options={{ title: 'Search' }} />
      <Tabs.Screen
        name="cart"
        options={{ title: 'Cart', tabBarBadge: cartItemCount > 0 ? cartItemCount : undefined }}
      />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
