import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Motion, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ProductThumbProps = {
  imageUrl: string | null;
  /** Product name; the first letter is the fallback when there is no image. */
  name: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/** Product thumbnail: live image when available, letter monogram otherwise. */
export function ProductThumb({ imageUrl, name, size = 48, style }: ProductThumbProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.well,
        { width: size, height: size, backgroundColor: theme.accentMuted },
        style,
      ]}>
      {imageUrl ? (
        <Image
          source={imageUrl}
          contentFit="cover"
          transition={Motion.fast}
          style={{ width: size, height: size }}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <ThemedText type="smallBold" themeColor="accent">
          {name.slice(0, 1).toUpperCase()}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  well: {
    borderRadius: Radii.thumb,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
