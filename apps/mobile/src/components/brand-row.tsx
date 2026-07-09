import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontFamilies } from '@/constants/theme';

export type BrandRowProps = {
  right?: ReactNode;
};

/** Shared tab-screen wordmark row with an optional contextual action. */
export function BrandRow({ right }: BrandRowProps) {
  return (
    <View style={styles.row}>
      <ThemedText type="smallBold" themeColor="accent" style={styles.wordmark}>
        Cartwise
      </ThemedText>
      {right ?? <View />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordmark: {
    fontFamily: FontFamilies.displayBold,
    fontSize: 17,
    lineHeight: 22,
  },
});
