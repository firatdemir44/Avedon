import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';
import type { AssistantPersonaKey } from '../api/client';
import { useReduceMotion } from '../features/useReduceMotion';
import { useTheme } from '../theme/ThemeContext';

// Asistan avatarı (Faz 1, Adım 9; karar: docs/yol-haritasi.md §5).
// Düz (flat) geometrik çizim büst, iki karakter: İpek ve Mert. Video ve ses YOK.
//
// Animasyon kuralı: SVG özellikleri animasyonlanmaz, kare durum değiştikçe
// yeniden çizilir (göz kırpma, ağız, düşünme noktaları zamanlayıcı ile).
// Yalnızca "dinliyor" salınımı Animated ile, saran View üzerinde; web'de native
// sürücü kapalı. "Hareketi azalt" açıksa hiçbir hareket olmaz.

export type AssistantAvatarState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'result';

// Tema tokenlarına ek ten ve saç tonları: yalnızca bu çizimde geçerli.
const SKIN = '#F0C9A8';
const SKIN_SHADE = '#DEB08C';
const HAIR_IPEK = '#8A452A'; // kırmızımsı kahve
const HAIR_MERT = '#3A2A1E'; // koyu kahve
const INK = '#2B1D14'; // göz ve kaş
const MOUTH = '#96483A';

const USE_NATIVE_DRIVER = Platform.OS !== 'web';

const BLINK_MIN_MS = 2800;
const BLINK_EXTRA_MS = 1600;
const BLINK_HOLD_MS = 130;
const TALK_STEP_MS = 190;
const DOT_STEP_MS = 320;

// Omuz/yaka, boyun ve baş aynı 100x100 tuvalinde. Yüz: cx 50, cy 42, rx 20, ry 22.
const SHOULDERS = 'M10 100 C10 84 27 74 50 74 C73 74 90 84 90 100 Z';
const IPEK_BACK_HAIR = 'M26 42 C26 16 36 8 50 8 C64 8 74 16 74 42 L74 78 L64 76 L64 38 L36 38 L36 76 L26 78 Z';
const IPEK_FRINGE = 'M28 44 C28 19 37 12 50 12 C63 12 72 19 72 44 C69 31 62 26 50 26 C38 26 31 33 28 44 Z';
const MERT_HAIR = 'M30 44 C30 21 38 14 50 14 C62 14 70 21 70 44 C68 33 61 29 50 29 C39 29 32 34 30 44 Z';

export function AssistantAvatar({
  persona,
  size = 96,
  state = 'idle',
  frame = true,
  style,
  accessibilityLabel,
}: {
  persona: AssistantPersonaKey;
  size?: number;
  state?: AssistantAvatarState;
  // Yuvarlak köşeli açık bakır çerçeve (accentSoft). Seçim kartında ve
  // sohbette açık; başka bir zeminde kapatılabilir.
  frame?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const reduceMotion = useReduceMotion();
  const isIpek = persona !== 'mert';
  const hair = isIpek ? HAIR_IPEK : HAIR_MERT;

  // Göz kırpma: boşta ve konuşurken; düşünürken gözler yana bakar, kırpmaz.
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (reduceMotion || state === 'thinking') {
      setBlink(false);
      return;
    }
    let alive = true;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    let openTimer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      closeTimer = setTimeout(() => {
        if (!alive) return;
        setBlink(true);
        openTimer = setTimeout(() => {
          if (!alive) return;
          setBlink(false);
          schedule();
        }, BLINK_HOLD_MS);
      }, BLINK_MIN_MS + Math.random() * BLINK_EXTRA_MS);
    };
    schedule();
    return () => {
      alive = false;
      if (closeTimer) clearTimeout(closeTimer);
      if (openTimer) clearTimeout(openTimer);
    };
  }, [reduceMotion, state]);

  // Konuşurken ağız açılıp kapanır (küçük hareket).
  const [talkOpen, setTalkOpen] = useState(false);
  useEffect(() => {
    if (state !== 'speaking' || reduceMotion) {
      setTalkOpen(false);
      return;
    }
    const id = setInterval(() => setTalkOpen((value) => !value), TALK_STEP_MS);
    return () => clearInterval(id);
  }, [state, reduceMotion]);

  // Düşünürken üç nokta baloncuğu sırayla koyulaşır.
  const [dot, setDot] = useState(0);
  useEffect(() => {
    if (state !== 'thinking' || reduceMotion) {
      setDot(0);
      return;
    }
    const id = setInterval(() => setDot((value) => (value + 1) % 3), DOT_STEP_MS);
    return () => clearInterval(id);
  }, [state, reduceMotion]);

  // Dinlerken hafif yukarı aşağı salınım.
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (state !== 'listening' || reduceMotion) {
      bob.stopAnimation(() => bob.setValue(0));
      return;
    }
    const step = (toValue: number) =>
      Animated.timing(bob, {
        toValue,
        duration: 900,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: USE_NATIVE_DRIVER,
      });
    const loop = Animated.loop(Animated.sequence([step(1), step(0)]));
    loop.start();
    return () => {
      loop.stop();
      bob.setValue(0);
    };
  }, [state, reduceMotion, bob]);

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -Math.max(2, size * 0.04)] });

  const thinking = state === 'thinking';
  const eyeShift = thinking ? 3 : 0;
  const leftEyeX = 42 + eyeShift;
  const rightEyeX = 58 + eyeShift;
  // Düşünürken sağ kaş biraz kalkar.
  const rightBrowLift = thinking ? 2 : 0;
  const tilt = state === 'result' ? -5 : 0;

  const label = accessibilityLabel ?? `${isIpek ? 'İpek' : 'Mert'} avatarı`;

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[
        { width: size, height: size, transform: [{ translateY }] },
        frame
          ? {
              backgroundColor: t.colors.accentSoft,
              overflow: 'hidden',
              borderRadius: size <= t.size.control ? t.radius.md : t.radius.lg,
            }
          : null,
        style,
      ]}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {/* Omuzlar ve yaka: asistan bakırı (accent) yalnızca yakada/aksesuarda. */}
        <Path d={SHOULDERS} fill={t.colors.brand} />
        {isIpek ? (
          <Path d="M38 73 L50 86 L62 73 L66 76 L50 92 L34 76 Z" fill={t.colors.accent} />
        ) : (
          <G>
            <Path d="M42 72 L50 84 L36 79 Z" fill={t.colors.accent} />
            <Path d="M58 72 L50 84 L64 79 Z" fill={t.colors.accent} />
            <Line x1="50" y1="84" x2="50" y2="100" stroke={t.colors.accent} strokeWidth="2" />
          </G>
        )}

        {/* Boyun: çenenin altına girer. */}
        <Rect x="44" y="56" width="12" height="16" rx="5" fill={SKIN_SHADE} />

        <G rotation={tilt} origin="50, 68">
          {isIpek ? <Path d={IPEK_BACK_HAIR} fill={hair} /> : null}
          <Ellipse cx="50" cy="42" rx="20" ry="22" fill={SKIN} />
          {isIpek ? null : (
            <G>
              <Circle cx="30" cy="45" r="3.4" fill={SKIN_SHADE} />
              <Circle cx="70" cy="45" r="3.4" fill={SKIN_SHADE} />
            </G>
          )}
          <Path d={isIpek ? IPEK_FRINGE : MERT_HAIR} fill={hair} />
          {isIpek ? null : (
            <G>
              <Path d="M30.6 40 L34 40 L34 50 L30.6 47.5 Z" fill={hair} />
              <Path d="M69.4 40 L66 40 L66 50 L69.4 47.5 Z" fill={hair} />
            </G>
          )}

          {/* Kaşlar */}
          <Line x1="38" y1="35.5" x2="46" y2="34.5" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
          <Line
            x1="54"
            y1={34.5 - rightBrowLift}
            x2="62"
            y2={35.5 - rightBrowLift}
            stroke={INK}
            strokeWidth="1.8"
            strokeLinecap="round"
          />

          {/* Gözler: nokta; kırparken çizgi. */}
          {blink ? (
            <G>
              <Line
                x1={leftEyeX - 3}
                y1="42"
                x2={leftEyeX + 3}
                y2="42"
                stroke={INK}
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <Line
                x1={rightEyeX - 3}
                y1="42"
                x2={rightEyeX + 3}
                y2="42"
                stroke={INK}
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </G>
          ) : (
            <G>
              <Circle cx={leftEyeX} cy="42" r="2.6" fill={INK} />
              <Circle cx={rightEyeX} cy="42" r="2.6" fill={INK} />
            </G>
          )}

          {/* Burun */}
          <Path
            d="M50 44.5 L50 50 Q50 51.4 52 51.4"
            fill="none"
            stroke={SKIN_SHADE}
            strokeWidth="1.6"
            strokeLinecap="round"
          />

          <Mouth state={state} talkOpen={talkOpen} />
        </G>

        {thinking ? <ThinkingBubble dot={reduceMotion ? -1 : dot} /> : null}
      </Svg>
    </Animated.View>
  );
}

function Mouth({ state, talkOpen }: { state: AssistantAvatarState; talkOpen: boolean }) {
  if (state === 'speaking' && talkOpen) {
    return <Ellipse cx="50" cy="56.5" rx="3.6" ry="2.9" fill={MOUTH} />;
  }
  if (state === 'result') {
    return <Path d="M44 54.5 Q50 60 56 54.5" fill="none" stroke={MOUTH} strokeWidth="2.4" strokeLinecap="round" />;
  }
  return <Path d="M45.5 55.5 Q50 57.6 54.5 55.5" fill="none" stroke={MOUTH} strokeWidth="2" strokeLinecap="round" />;
}

// dot: etkin nokta sırası; -1 ise (hareketi azalt) hepsi eşit koyulukta.
function ThinkingBubble({ dot }: { dot: number }) {
  const t = useTheme();
  return (
    <G>
      <Circle cx="70" cy="27" r="2.6" fill={t.colors.surface1} stroke={t.colors.line} strokeWidth="1.2" />
      <Ellipse cx="82" cy="16" rx="14" ry="9" fill={t.colors.surface1} stroke={t.colors.line} strokeWidth="1.5" />
      {[0, 1, 2].map((index) => (
        <Circle
          key={index}
          cx={76 + index * 6}
          cy="16"
          r="2.1"
          fill={t.colors.accent}
          opacity={dot === -1 || dot === index ? 1 : 0.32}
        />
      ))}
    </G>
  );
}
