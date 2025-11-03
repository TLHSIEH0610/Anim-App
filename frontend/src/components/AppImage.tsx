import React from 'react';
import { Platform, Image as RNImage, ImageProps as RNImageProps, ImageStyle, StyleProp } from 'react-native';
// Use expo-image where available
let ExpoImage: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ExpoImage = require('expo-image').Image;
} catch (_) {}

type ContentFit = 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';

export type AppImageProps = {
  source: RNImageProps['source'];
  style?: StyleProp<ImageStyle>;
  contentFit?: ContentFit; // expo-image
  cachePolicy?: 'none' | 'disk' | 'memory' | 'memory-disk';
  placeholder?: any; // blurhash/object for expo-image
  transition?: number;
  onLoad?: () => void;
  onError?: () => void;
  // any other passthrough props if needed
} & Omit<RNImageProps, 'source' | 'style' | 'onLoad' | 'onError' | 'resizeMode'>;

export default function AppImage(props: AppImageProps) {
  const { source, style, contentFit = 'cover', cachePolicy, placeholder, transition, onLoad, onError, ...rest } = props;

  // On Android, fall back to React Native Image to avoid native delegate crashes from mismatched expo-image
  if (Platform.OS === 'android' || !ExpoImage) {
    const resizeMode = contentFit === 'contain' ? 'contain' : contentFit === 'cover' ? 'cover' : 'cover';
    return (
      <RNImage
        source={source as any}
        style={style}
        resizeMode={resizeMode as any}
        onLoad={onLoad}
        onError={onError as any}
        {...rest}
      />
    );
  }

  // iOS / web path with expo-image
  return (
    <ExpoImage
      source={source}
      style={style}
      contentFit={contentFit}
      cachePolicy={cachePolicy}
      placeholder={placeholder}
      transition={transition}
      onLoad={onLoad}
      onError={onError}
      {...rest}
    />
  );
}

