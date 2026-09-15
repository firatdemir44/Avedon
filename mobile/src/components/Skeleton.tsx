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

// ---- Liste iskeletleri: her biri gerçek satırın/kartın boyunu ve dizilişini taklit ediyor.

export type SkeletonListVariant = 'product' | 'post' | 'row' | 'request' | 'comment' | 'chat';

const DEFAULT_COUNT: Record<SkeletonListVariant, number> = {
  product: 6,
  post: 3,
  row: 7,
  request: 5,
  comment: 5,
  chat: 6,
};

// Yeni düzene (5. aşama) geçmiş listeler:
//   blok  → gri aralıktan sonra tek beyaz blok içinde çizgili satırlar (ürünler, yorumlar)
//   yığın → gri aralıklarla ayrılmış kenardan kenara beyaz bloklar (akış)
// Diğerleri kendi ekranları geçene kadar köşeli kart.
const BLOCK_VARIANTS: SkeletonListVariant[] = ['product', 'comment'];
const STACK_VARIANTS: SkeletonListVariant[] = ['post'];

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
  const containerStyle = BLOCK_VARIANTS.includes(variant)
    ? styles.listFlush
    : STACK_VARIANTS.includes(variant)
      ? styles.listStack
      : styles.list;
  return (
    <SkeletonPulse style={[containerStyle, style]}>
      {items.map((i) => {
        const w = LINE_WIDTHS[i % LINE_WIDTHS.length];
        switch (variant) {
          case 'product':
            return <ProductRowBones key={i} lineWidth={w} last={i === count - 1} />;
          case 'post':
            // PostCard ile aynı sıra: yazar → görsel → ölçü şeridi → metin → eylem çubuğu.
            return (
              <View key={i} style={styles.postBlock}>
                <View style={styles.inlineGap}>
                  <Bone width={36} height={36} rounded={radius.md} />
                  <View style={[styles.flex, styles.gapXs]}>
                    <Bone width={190} height={13} />
                    <Bone width={130} height={11} soft />
                  </View>
                </View>
                {i === 0 ? <Bone height={190} rounded={radius.md} soft /> : null}
                {i === 0 ? <Bone height={40} rounded={radius.md} soft /> : null}
                <Bone width="100%" height={12} soft />
                <Bone width={w} height={12} soft />
                <View style={[styles.spread, styles.postActionBar]}>
                  <View style={styles.inlineGap}>
                    <Bone width={40} height={14} soft />
                    <Bone width={36} height={14} soft />
                    <Bone width={20} height={14} soft />
                  </View>
                  {i === 0 ? <Bone width={96} height={36} rounded={radius.md} /> : null}
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
            // PostCommentsScreen satırı: ad · firma + saat, altında yorum.
            return (
              <View key={i} style={[styles.commentRow, i < count - 1 && styles.rowDivider]}>
                <View style={styles.spread}>
                  <Bone width={160} height={13} />
                  <Bone width={36} height={11} soft />
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

// ProductRow ile aynı ölçüler: 64px görsel, kod + tip, firma, içerik, ölçü satırı.
function ProductRowBones({ lineWidth, last, noCompany }: { lineWidth: DimensionValue; last?: boolean; noCompany?: boolean }) {
  return (
    <View style={[styles.productRow, !last && styles.rowDivider]}>
      <Bone width={64} height={64} rounded={radius.md} />
      <View style={styles.productLines}>
        <View style={styles.inlineGap}>
          <Bone width={88} height={15} />
          <Bone width={46} height={16} rounded={radius.sm} soft />
        </View>
        {noCompany ? null : <Bone width={120} height={12} />}
        <Bone width={lineWidth} height={12} soft />
        <View style={[styles.spread, styles.measureRow]}>
          <Bone width={150} height={11} soft />
          <Bone width={52} height={12} soft />
        </View>
      </View>
    </View>
  );
}

// ---- Sayfa iskeletleri: ayrıntı ekranlarının üst yerleşimi.

export type SkeletonDetailVariant = 'product' | 'profile' | 'company' | 'timeline';

// Yeni düzene geçmiş sayfalar kenardan kenara bloklarla çiziliyor (iç boşluk yok).
const FLUSH_DETAILS: SkeletonDetailVariant[] = ['product', 'company'];

export function SkeletonDetail({
  variant,
  style,
}: {
  variant: SkeletonDetailVariant;
  style?: StyleProp<ViewStyle>;
}) {
  const flush = FLUSH_DETAILS.includes(variant);
  return (
    <SkeletonPulse style={[flush ? styles.detailFlush : styles.detail, style]}>{renderDetail(variant)}</SkeletonPulse>
  );
}

function renderDetail(variant: SkeletonDetailVariant) {
  switch (variant) {
    case 'product':
      return (
        <>
          <View style={[styles.block, styles.blockPad, styles.gapMd]}>
            <Bone height={219} rounded={radius.md} />
            <View style={styles.spread}>
              <View style={styles.gapXs}>
                <Bone width={140} height={24} />
                <Bone width={170} height={13} soft />
              </View>
              <Bone width={64} height={24} rounded={radius.sm} soft />
            </View>
          </View>
          <View style={[styles.block, styles.specBlock]}>
            {['Stok', 'Ağırlık', 'Genişlik', 'İçerik', 'Tip'].map((key, i) => (
              <View key={key} style={[styles.spread, styles.specRow, i < 4 && styles.rowDivider]}>
                <Bone width={64} height={12} soft />
                <Bone width={i === 3 ? 130 : 90} height={13} />
              </View>
            ))}
          </View>
          <View style={[styles.block, styles.blockPad, styles.inlineGap]}>
            <Bone width={36} height={36} rounded={radius.md} />
            <View style={[styles.flex, styles.gapXs]}>
              <Bone width="55%" height={14} />
              <Bone width="40%" height={11} soft />
            </View>
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
          <View style={[styles.block, styles.blockPad]}>
            <View style={styles.inlineGap}>
              <Bone width={56} height={56} rounded={radius.md} />
              <View style={[styles.flex, styles.gapXs]}>
                <Bone width={180} height={20} />
                <View style={styles.inlineGap}>
                  <Bone width={92} height={20} rounded={radius.sm} soft />
                  <Bone width={110} height={12} soft />
                </View>
              </View>
            </View>
          </View>
          <View style={styles.sectionBone}>
            <Bone width={80} height={12} soft />
          </View>
          <View style={styles.block}>
            {[0, 1].map((i) => (
              <ProductRowBones key={i} lineWidth={LINE_WIDTHS[i]} last={i === 1} noCompany />
            ))}
          </View>
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
  listFlush: { marginTop: spacing.blockGap, backgroundColor: colors.surface },
  listStack: { paddingTop: spacing.blockGap },
  postBlock: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.gutter,
    paddingVertical: 12,
    gap: 10,
    marginBottom: spacing.blockGap,
  },
  postActionBar: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 12, minHeight: 40 },
  commentRow: { paddingHorizontal: spacing.gutter, paddingVertical: 12, gap: 8 },
  detail: { padding: spacing.lg },
  detailFlush: { gap: spacing.blockGap },
  // Henüz yeni düzene geçmemiş kartlarla aynı kutu: beyaz, 6px köşe, 16px iç boşluk.
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  block: { backgroundColor: colors.surface },
  blockPad: { paddingHorizontal: spacing.gutter, paddingVertical: 12 },
  specBlock: { paddingHorizontal: spacing.gutter, paddingVertical: spacing.xs },
  specRow: { minHeight: 40 },
  sectionBone: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 8 },
  compactGap: { marginBottom: spacing.sm },
  productRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: spacing.gutter,
    paddingTop: 12,
    paddingBottom: 14,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  productLines: { flex: 1, gap: 7, paddingTop: 1 },
  measureRow: { marginTop: 4 },
  inlineGap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  gapXs: { gap: 6 },
  gapSm: { gap: spacing.sm },
  gapMd: { gap: 12 },
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
