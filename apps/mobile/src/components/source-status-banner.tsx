import type { ChainSlug, Store } from '@cartwise/shared';
import { StyleSheet, View, type ViewProps } from 'react-native';

import type { ResponseSource, SourceStatus } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { chainLabel } from '@/lib/price';

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
        { backgroundColor: theme.backgroundSelected },
        style,
      ]}
      {...rest}>
      <View style={styles.statusDots} accessibilityElementsHidden>
        {statuses.map((source) => (
          <View
            key={source.chain}
            style={[
              styles.statusDot,
              { backgroundColor: theme[source.status === 'error' ? 'danger' : 'deal'] },
            ]}
          />
        ))}
      </View>
      <ThemedText type="caption" themeColor="textSecondary" style={styles.message}>
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
    minHeight: 40,
    borderRadius: Radii.control,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  statusDots: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: Radii.chip,
  },
  message: {
    flex: 1,
    minWidth: 0,
  },
});
