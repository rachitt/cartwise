import type { ChainSlug, Store } from '@cartwise/shared';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, View, type ViewProps } from 'react-native';

import type { ResponseSource, SourceStatus } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { chainLabel } from '@/lib/price';

const WARNING_ICON = {
  ios: 'exclamationmark.triangle',
  android: 'warning',
  web: 'warning',
} satisfies SymbolViewProps['name'];

type SourceStatusBannerProps = ViewProps & {
  sources?: ResponseSource[] | null;
  stores: Store[];
};

const statusRank: Record<Extract<SourceStatus, 'stale' | 'error'>, number> = {
  stale: 1,
  error: 2,
};

export function SourceStatusBanner({
  sources,
  stores,
  style,
  ...rest
}: SourceStatusBannerProps) {
  const theme = useTheme();
  const statuses = selectedSourceStatuses(sources, stores);

  if (statuses.length === 0) {
    return null;
  }

  const hasError = statuses.some((source) => source.status === 'error');
  const chainText = formatChainList(statuses.map((source) => chainLabel(source.chain)));
  const message = hasError
    ? `${chainText} live prices are unavailable - showing last known`
    : `${chainText} prices may be outdated - showing last known`;

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.banner,
        { backgroundColor: theme.dangerMuted, borderColor: theme.danger },
        style,
      ]}
      {...rest}>
      <SymbolView name={WARNING_ICON} tintColor={theme.danger} size={18} />
      <ThemedText type="small" themeColor="danger" style={styles.message}>
        {message}
      </ThemedText>
    </View>
  );
}

function selectedSourceStatuses(sources: ResponseSource[] | null | undefined, stores: Store[]) {
  const selectedChains = new Set(stores.map((store) => store.chain));
  const statusByChain = new Map<ChainSlug, Extract<SourceStatus, 'stale' | 'error'>>();

  for (const source of sources ?? []) {
    if (
      !selectedChains.has(source.chain) ||
      (source.status !== 'stale' && source.status !== 'error')
    ) {
      continue;
    }

    const current = statusByChain.get(source.chain);
    if (!current || statusRank[source.status] > statusRank[current]) {
      statusByChain.set(source.chain, source.status);
    }
  }

  return Array.from(statusByChain.entries())
    .map(([chain, status]) => ({ chain, status }))
    .sort((first, second) => chainLabel(first.chain).localeCompare(chainLabel(second.chain)));
}

function formatChainList(chains: string[]) {
  if (chains.length <= 1) {
    return chains[0] ?? 'Nearby stores';
  }

  if (chains.length === 2) {
    return `${chains[0]} and ${chains[1]}`;
  }

  return `${chains.slice(0, -1).join(', ')}, and ${chains[chains.length - 1]}`;
}

const styles = StyleSheet.create({
  banner: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: Radii.control,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  message: {
    flex: 1,
    minWidth: 0,
  },
});
