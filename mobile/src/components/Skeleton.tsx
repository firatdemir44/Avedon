import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, spacing } from '../theme';

// Yükleniyor iskeleti: içeriğin gelecek yerini gri kemiklerle gösterir
// (onaylı taslak: docs/tasarim-yonleri/CYukleniyor.dc.html). Ortadaki tek
// dönen çembere göre sayfa "boş" görünmüyor ve veri gelince yerleşim zıplamıyor.
//
// Tek ekran için TEK animasyon: kemikler kendileri yanıp sönmüyor, hepsini
// saran SkeletonPulse sönüp parlıyor. Böylece hepsi aynı ritimde ve ucuz.

// Çok hızlı yüklemelerde iskeletin bir an görünüp kaybolması titreme gibi
// algılanıyor; bu kadar kısa sürede hiçbir şey göstermiyoruz.
const SHOW_DELAY_MS = 150;

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduce(value);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

export function SkeletonPulse({
  children,
  style,
  label = 'Yükleniyor',
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  label?: string;
}) {
  const opacity = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReduceMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // "Hareketi azalt" açıksa iskelet sabit durur; bilgi aynı, hareket yok.
    if (reduceMotion || !visible) {
      opacity.setValue(1);
      return;
    }
    const half = { duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true };
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.45, ...half }),
        Animated.timing(opacity, { toValue: 1, ...half }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, visible, opacity]);

  return (
    <Animated.View
      style={[style, { opacity: visible ? opacity : 0 }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      {children}
    </Animated.View>
  );
}

export function Bone({
  width = '100%',
  height = 12,
  rounded = 3,
  soft,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  rounded?: number;
  soft?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        { width, height, borderRadius: rounded, backgroundColor: soft ? colors.skeletonSoft : colors.skeleton },
        style,
      ]}
    />
  );
}

// ---- Liste iskeletleri: her biri gerçek kartın boyunu ve dizilişini taklit ediyor.

export type SkeletonListVariant = 'product' | 'post' | 'row' | 'request' | 'comment' | 'chat';

const DEFAULT_COUNT: Record<SkeletonListVariant, number> = {
  product: 5,
  post: 3,
  row: 7,
  request: 5,
  comment: 5,
  chat: 6,
};

// Aynı genişlikte kemikler yapay duruyor; satırdan satıra hafif değişiyor.
const LINE_WIDTHS: DimensionValue[] = ['72%', '58%', '84%', '64%', '78%', '52%', '90%'];

export function SkeletonList({
  variant,
  count = DEFAULT_COUNT[variant],
  style,
}: {
  variant: SkeletonListVariant;
  count?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const items = Array.from({ length: count }, (_, i) => i);
  return (
    <SkeletonPulse style={[styles.list, style]}>
      {items.map((i) => {
        const w = LINE_WIDTHS[i % LINE_WIDTHS.length];
        switch (variant) {
          case 'product':
            return (
              <View key={i} style={[styles.card, styles.productCard]}>
                <Bone width={76} height={76} rounded={radius.md} />
                <View style={styles.productLines}>
                  <View style={styles.spread}>
                    <Bone width={96} height={16} />
                    <Bone width={56} height={20} rounded={radius.sm} soft />
                  </View>
                  <Bone width={120} height={12} />
                  <Bone width={w} height={12} soft />
                  <Bone width="60%" height={11} soft />
                </View>
              </View>
            );
          case 'post':
            return (
              <View key={i} style={[styles.card, styles.gapSm]}>
                <View style={styles.spread}>
                  <View style={[styles.flex, styles.gapXs]}>
                    <Bone width={140} height={15} />
                    <Bone width={190} height={11} soft />
                    <Bone width={110} height={11} soft />
                  </View>
                  <Bone width={40} height={40} rounded={radius.md} />
                </View>
                {i === 0 ? <Bone height={180} rounded={radius.md} soft /> : null}
                <Bone width="100%" height={12} soft />
                <Bone width={w} height={12} soft />
                <View style={[styles.spread, styles.postActions]}>
                  <Bone width={52} height={12} soft />
                  <Bone width={64} height={12} soft />
                  <Bone width={52} height={12} soft />
                </View>
              </View>
            );
          case 'row':
            return (
              <View key={i} style={[styles.card, styles.gapXs]}>
                <View style={styles.spread}>
                  <Bone width={w} height={15} style={styles.shrink} />
                  <Bone width={36} height={11} soft />
                </View>
                <Bone width={120} height={12} soft />
                <Bone width="80%" height={12} soft />
              </View>
            );
          case 'request':
            return (
              <View key={i} style={[styles.card, styles.gapXs]}>
                <View style={styles.spread}>
                  <Bone width={96} height={16} />
                  <Bone width={84} height={20} rounded={radius.sm} soft />
                </View>
                <Bone width={w} height={12} soft />
                <Bone width={150} height={12} soft />
              </View>
            );
          case 'comment':
            return (
              <View key={i} style={[styles.card, styles.gapXs, styles.compactGap]}>
                <View style={styles.spread}>
                  <Bone width={120} height={13} />
                  <Bone width={40} height={11} soft />
                </View>
                <Bone width={w} height={12} soft />
              </View>
            );
          case 'chat': {
            const mine = i % 3 === 1;
            return (
              <View
                key={i}
                style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}
              >
                <Bone width="100%" height={12} soft={!mine} />
                <Bone width="45%" height={10} soft style={styles.bubbleTime} />
              </View>
            );
          }
        }
      })}
    </SkeletonPulse>
  );
}

// ---- Sayfa iskeletleri: ayrıntı ekranlarının üst yerleşimi.

export type SkeletonDetailVariant = 'product' | 'profile' | 'company' | 'timeline';

export function SkeletonDetail({
  variant,
  style,
}: {
  variant: SkeletonDetailVariant;
  style?: StyleProp<ViewStyle>;
}) {
  return <SkeletonPulse style={[styles.detail, style]}>{renderDetail(variant)}</SkeletonPulse>;
}

function renderDetail(variant: SkeletonDetailVariant) {
  switch (variant) {
    case 'product':
      return (
        <>
          <Bone height={260} rounded={radius.lg} />
          <View style={[styles.spread, styles.mtMd]}>
            <Bone width={140} height={26} />
            <Bone width={60} height={22} rounded={radius.sm} soft />
          </View>
          <View style={[styles.card, styles.companyRow, styles.mtMd]}>
            <Bone width={44} height={44} rounded={radius.md} />
            <View style={[styles.flex, styles.gapXs]}>
              <Bone width="60%" height={15} />
              <Bone width="45%" height={18} rounded={radius.sm} soft />
            </View>
          </View>
          <View style={[styles.card, styles.mtMd, styles.gapSm]}>
            <Bone width={96} height={18} />
            {LINE_WIDTHS.map((w, i) => (
              <View key={i} style={styles.spread}>
                <Bone width={90} height={12} soft />
                <Bone width={w === '90%' ? 140 : 100} height={12} />
              </View>
            ))}
          </View>
        </>
      );
    case 'profile':
      return (
        <>
          <Bone width={200} height={26} />
          <Bone width={150} height={14} soft style={styles.mtSm} />
          <Bone width={130} height={16} style={styles.mtSm} />
          <View style={styles.divider} />
          <Bone width={60} height={11} soft />
          <Bone width={170} height={14} style={styles.mtXs} />
        </>
      );
    case 'company':
      return (
        <>
          <View style={styles.companyRow}>
            <Bone width={56} height={56} rounded={radius.md} />
            <Bone width={170} height={24} />
          </View>
          <Bone width={140} height={13} soft style={styles.mtSm} />
          <Bone width="90%" height={13} soft style={styles.mtXs} />
          <Bone width="70%" height={13} soft style={styles.mtXs} />
          <View style={[styles.spread, styles.mtMd, styles.gapSmRow]}>
            <Bone height={44} rounded={radius.md} style={styles.flex} />
            <Bone height={44} rounded={radius.md} soft style={styles.flex} />
          </View>
          <Bone width={120} height={18} style={styles.mtLg} />
          {[0, 1].map((i) => (
            <View key={i} style={[styles.card, styles.productCard, styles.mtSm]}>
              <Bone width={76} height={76} rounded={radius.md} />
              <View style={styles.productLines}>
                <Bone width={96} height={16} />
                <Bone width="80%" height={12} soft />
                <Bone width="60%" height={11} soft />
              </View>
            </View>
          ))}
        </>
      );
    case 'timeline':
      return (
        <>
          <Bone width={150} height={48} rounded={radius.md} soft />
          <Bone width={190} height={14} style={styles.mtMd} />
          <View style={styles.mtLg}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={styles.timelineRow}>
                <Bone width={22} height={22} rounded={11} />
                <View style={[styles.flex, styles.gapXs]}>
                  <Bone width={LINE_WIDTHS[i]} height={16} />
                  <Bone width={100} height={11} soft />
                </View>
              </View>
            ))}
          </View>
        </>
      );
  }
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg },
  detail: { padding: spacing.lg },
  // Gerçek kartlarla aynı kutu: beyaz, 6px köşe, 16px iç boşluk.
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  compactGap: { marginBottom: spacing.sm },
  productCard: { flexDirection: 'row', gap: spacing.md },
  productLines: { flex: 1, gap: 9, paddingTop: 2 },
  companyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  gapXs: { gap: 6 },
  gapSm: { gap: spacing.sm },
  gapSmRow: { gap: spacing.sm },
  postActions: { marginTop: spacing.xs, paddingHorizontal: spacing.md },
  bubble: {
    width: '62%',
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
  },
  bubbleOther: { alignSelf: 'flex-start', backgroundColor: colors.surface },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: colors.skeleton },
  bubbleTime: { marginTop: spacing.sm },
  timelineRow: { flexDirection: 'row', gap: spacing.md, paddingBottom: spacing.lg },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  mtXs: { marginTop: spacing.xs },
  mtSm: { marginTop: spacing.sm },
  mtMd: { marginTop: spacing.md },
  mtLg: { marginTop: spacing.lg },
});
