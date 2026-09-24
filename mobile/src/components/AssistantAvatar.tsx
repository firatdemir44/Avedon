import React, { useEffect, useRef } from 'react';
import { tr } from '../i18n';
import { Animated, Easing, Platform, type StyleProp, type ViewStyle } from 'react-native';
import { useReduceMotion } from '../features/useReduceMotion';
import { useTheme } from '../theme/ThemeContext';
import { TakyonMark } from '../ui/TakyonMark';

// Asistan avatarı (kullanıcı kararı 2026-09-23): İpek/Mert çizimleri kaldırıldı;
// tek kimlik "Takyon asistanı", yüzü Takyon işareti (TakyonMark) — yuvarlak
// brandSoft rozet içinde renkli girdap.
//
// Hareket: dinlerken, düşünürken ve konuşurken hafif nabız (ölçek). Web'de native
// sürücü kapalı; "Hareketi azalt" açıksa hareket yok.

export type AssistantAvatarState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'result';

export const ASSISTANT_DISPLAY_NAME = 'Takyon asistanı';

const USE_NATIVE_DRIVER = Platform.OS !== 'web';
const PULSE_MS = 700;

export function AssistantAvatar({
  size = 96,
  state = 'idle',
  frame = true,
  style,
  accessibilityLabel,
}: {
  size?: number;
  state?: AssistantAvatarState;
  // Yuvarlak brandSoft zemin; başka bir zeminde kapatılabilir.
  frame?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const reduceMotion = useReduceMotion();
  const active = state === 'listening' || state === 'thinking' || state === 'speaking';

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active || reduceMotion) {
      pulse.stopAnimation(() => pulse.setValue(0));
      return;
    }
    const step = (toValue: number) =>
      Animated.timing(pulse, {
        toValue,
        duration: PULSE_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: USE_NATIVE_DRIVER,
      });
    const loop = Animated.loop(Animated.sequence([step(1), step(0)]));
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(0);
    };
  }, [active, reduceMotion, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? tr(ASSISTANT_DISPLAY_NAME)}
      style={[
        {
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: t.radius.full,
          transform: [{ scale }],
        },
        frame ? { backgroundColor: t.colors.brandSoft } : null,
        style,
      ]}
    >
      <TakyonMark size={Math.round(size * 0.8)} />
    </Animated.View>
  );
}
