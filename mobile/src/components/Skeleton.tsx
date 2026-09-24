import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { useReduceMotion } from '../features/useReduceMotion';
import { useTheme } from '../theme/ThemeContext';
import { Skeleton, SkeletonRow, SkeletonText } from '../ui';
import { tr } from '../i18n';

// Yükleniyor iskeleti (DESIGN.md §3): surface-2 bloklar, radius-sm; içeriğin
// gelecek yerini gösterir, veri gelince yerleşim zıplamaz. Kemikler ui/Skeleton;
// bu dosya eski `SkeletonList` / `SkeletonDetail` / `Bone` / `SkeletonPulse`
// adlarını geriye dönük korur.
//
// Tek ekran için TEK animasyon: kemikler kendileri yanıp sönmüyor, hepsini
// saran SkeletonPulse sönüp parlıyor. Böylece hepsi aynı ritimde ve ucuz.

// Çok hızlı yüklemelerde iskeletin bir an görünüp kaybolması titreme gibi
// algılanıyor; bu kadar kısa sürede hiçbir şey göstermiyoruz.
const SHOW_DELAY_MS = 150;
// Ürün sayfası galerisinin iskelet yüksekliği (ekran-içi ölçü).
const HERO_HEIGHT = 219;
// Sohbet baloncuğunun genişliği (ekran-içi ölçü).
const BUBBLE_WIDTH: DimensionValue = '62%';

export function SkeletonPulse({
  children,
  style,
  label = tr('Yükleniyor'),
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

// Geriye dönük kemik: içi ui/Skeleton. `rounded` ve `soft` eski adlar; yeni
// tasarımda tek ton (surface-2) ve tek köşe (radius-sm), `soft` yalnızca
// hafif saydamlık verir.
export function Bone({
  width = '100%',
  height,
  rounded,
  soft,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  rounded?: number;
  soft?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const round = rounded !== undefined && rounded >= t.radius.full;
  return (
    <Skeleton
      width={width}
      height={height ?? t.space[3]}
      round={round}
      style={[soft && { opacity: 0.6 }, style]}
    />
  );
}

// ---- Liste iskeletleri: her biri gerçek satırın/kartın boyunu ve dizilişini taklit ediyor.

export type SkeletonListVariant =
  | 'product'
  | 'post'
  | 'row'
  | 'request'
  | 'comment'
  | 'chat'
  | 'conversation'
  | 'person';

const DEFAULT_COUNT: Record<SkeletonListVariant, number> = {
  product: 6,
  post: 3,
  row: 7,
  request: 5,
  comment: 5,
  chat: 6,
  conversation: 7,
  person: 7,
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
  const t = useTheme();
  const items = Array.from({ length: count }, (_, i) => i);
  const divider = (last: boolean): ViewStyle => ({
    borderBottomWidth: last ? 0 : 1,
    borderBottomColor: t.colors.line,
  });
  const card: ViewStyle = {
    backgroundColor: t.colors.surface1,
    borderWidth: 1,
    borderColor: t.colors.line,
    borderRadius: t.radius.lg,
    padding: t.space[4],
  };

  return (
    <SkeletonPulse style={[{ gap: variant === 'post' || variant === 'row' ? t.space[3] : 0 }, style]}>
      {items.map((i) => {
        const w = LINE_WIDTHS[i % LINE_WIDTHS.length];
        const last = i === count - 1;
        switch (variant) {
          case 'product':
            return <ProductRowBones key={i} lineWidth={w} last={last} />;
          case 'post':
            // Paylaşım kartı: yazar → görsel → metin → eylem çubuğu.
            return (
              <View key={i} style={[card, { padding: 0, gap: t.space[3] }]}>
                <SkeletonRow style={{ paddingHorizontal: t.space[4], minHeight: t.size.row }} />
                {i === 0 ? <Skeleton height={t.size.thumb * 2 + t.space[8]} style={{ borderRadius: 0 }} /> : null}
                <SkeletonText lines={2} style={{ paddingHorizontal: t.space[4] }} />
                <View
                  style={{
                    flexDirection: 'row',
                    gap: t.space[4],
                    paddingHorizontal: t.space[4],
                    minHeight: t.size.touchMin,
                    alignItems: 'center',
                    borderTopWidth: 1,
                    borderTopColor: t.colors.line,
                  }}
                >
                  <Skeleton width={t.size.avatar} height={t.space[4]} />
                  <Skeleton width={t.size.avatar} height={t.space[4]} />
                  <Skeleton width={t.size.avatarSm} height={t.space[4]} />
                </View>
              </View>
            );
          case 'row':
            return (
              <View key={i} style={[card, { gap: t.space[2] }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Skeleton width={w} height={t.space[4]} />
                  <Skeleton width={t.size.avatar} height={t.space[3]} />
                </View>
                <Skeleton width="45%" height={t.space[3]} />
                <Skeleton width="80%" height={t.space[3]} />
              </View>
            );
          case 'request':
            // Talep satırı: kod + durum rozeti, firma / talep eden, teslimat · zaman.
            return (
              <View key={i} style={[{ paddingVertical: t.space[3], gap: t.space[2], minHeight: t.size.row }, divider(last)]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Skeleton width="35%" height={t.space[4]} />
                  <Skeleton width={t.size.thumb} height={t.size.badge} />
                </View>
                <Skeleton width="45%" height={t.space[3]} />
                <Skeleton width={w} height={t.space[3]} />
              </View>
            );
          case 'comment':
            // Yorum satırı: ad · firma + saat, altında yorum.
            return (
              <View key={i} style={[{ paddingVertical: t.space[3], gap: t.space[2] }, divider(last)]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Skeleton width="50%" height={t.space[4]} />
                  <Skeleton width={t.size.avatar} height={t.space[3]} />
                </View>
                <Skeleton width={w} height={t.space[3]} />
              </View>
            );
          case 'conversation':
          case 'person':
            // Liste satırı: 40px avatar + iki satır (ui/SkeletonRow).
            return <SkeletonRow key={i} style={divider(last)} />;
          case 'chat': {
            const mine = i % 3 === 1;
            return (
              <View
                key={i}
                style={{
                  width: BUBBLE_WIDTH,
                  padding: t.space[4],
                  borderRadius: t.radius.lg,
                  marginBottom: t.space[2],
                  gap: t.space[2],
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  backgroundColor: mine ? t.colors.brandSoft : t.colors.surface1,
                  borderWidth: mine ? 0 : 1,
                  borderColor: t.colors.line,
                }}
              >
                <Skeleton width="100%" height={t.space[3]} />
                <Skeleton width="45%" height={t.space[2]} />
              </View>
            );
          }
        }
      })}
    </SkeletonPulse>
  );
}

// ui/ProductCard ile aynı ölçüler: 72px görsel, ad, kod, özellik satırı, firma.
function ProductRowBones({ lineWidth, last, noCompany }: { lineWidth: DimensionValue; last?: boolean; noCompany?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: t.space[3],
        paddingVertical: t.space[3],
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: t.colors.line,
      }}
    >
      <Skeleton width={t.size.thumb} height={t.size.thumb} />
      <View style={{ flex: 1, gap: t.space[2] }}>
        <Skeleton width="55%" height={t.space[4]} />
        <Skeleton width="35%" height={t.space[3]} />
        <Skeleton width={lineWidth} height={t.space[3]} />
        {noCompany ? null : <Skeleton width="40%" height={t.space[3]} />}
      </View>
    </View>
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
  const t = useTheme();
  return (
    <SkeletonPulse style={[{ gap: t.space[6] }, style]}>
      <DetailBones variant={variant} />
    </SkeletonPulse>
  );
}

function DetailBones({ variant }: { variant: SkeletonDetailVariant }) {
  const t = useTheme();
  const card: ViewStyle = {
    backgroundColor: t.colors.surface1,
    borderWidth: 1,
    borderColor: t.colors.line,
    borderRadius: t.radius.lg,
    padding: t.space[4],
    gap: t.space[3],
  };
  const specRow = (last: boolean): ViewStyle => ({
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: t.size.avatar,
    borderBottomWidth: last ? 0 : 1,
    borderBottomColor: t.colors.line,
  });

  switch (variant) {
    case 'product':
      return (
        <>
          <Skeleton height={HERO_HEIGHT} style={{ borderRadius: t.radius.lg }} />
          <View style={{ gap: t.space[2] }}>
            <Skeleton width="45%" height={t.space[6]} />
            <Skeleton width="60%" height={t.space[4]} />
          </View>
          <View style={card}>
            {[0, 1, 2, 3, 4].map((i) => (
              <View key={i} style={specRow(i === 4)}>
                <Skeleton width="25%" height={t.space[3]} />
                <Skeleton width={i === 3 ? '45%' : '30%'} height={t.space[4]} />
              </View>
            ))}
          </View>
          <SkeletonRow />
        </>
      );
    case 'profile':
      // Kimlik bloğu: avatar; ad, unvan, firma; altında telefon satırı.
      return (
        <View style={card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
            <Skeleton width={t.size.thumb} height={t.size.thumb} round />
            <View style={{ flex: 1, gap: t.space[2] }}>
              <Skeleton width="60%" height={t.space[5]} />
              <Skeleton width="45%" height={t.space[3]} />
              <Skeleton width="40%" height={t.space[3]} />
            </View>
          </View>
          <View style={[specRow(true), { borderTopWidth: 1, borderTopColor: t.colors.line, minHeight: t.size.control }]}>
            <Skeleton width="20%" height={t.space[3]} />
            <Skeleton width="40%" height={t.space[4]} />
          </View>
        </View>
      );
    case 'company':
      return (
        <>
          <View style={card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
              <Skeleton width={t.size.thumb} height={t.size.thumb} />
              <View style={{ flex: 1, gap: t.space[2] }}>
                <Skeleton width="65%" height={t.space[5]} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
                  <Skeleton width={t.size.thumb + t.space[5]} height={t.size.badge} />
                  <Skeleton width="35%" height={t.space[3]} />
                </View>
              </View>
            </View>
          </View>
          <Skeleton width="30%" height={t.space[5]} />
          <View>
            {[0, 1].map((i) => (
              <ProductRowBones key={i} lineWidth={LINE_WIDTHS[i]} last={i === 1} noCompany />
            ))}
          </View>
        </>
      );
    case 'timeline':
      // Numune takibi: özet kartı (kod + durum, firma, teslimat) ve adımlar kartı.
      return (
        <>
          <View style={[card, { gap: t.space[2] }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Skeleton width="35%" height={t.space[5]} />
              <Skeleton width={t.size.thumb} height={t.size.badge} />
            </View>
            <Skeleton width="45%" height={t.space[3]} />
            <Skeleton width="60%" height={t.space[3]} />
          </View>
          <View style={card}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={{ flexDirection: 'row', gap: t.space[4], paddingBottom: t.space[4] }}>
                <Skeleton width={t.size.badge} height={t.size.badge} round />
                <View style={{ flex: 1, gap: t.space[2] }}>
                  <Skeleton width={LINE_WIDTHS[i]} height={t.space[4]} />
                  <Skeleton width="40%" height={t.space[3]} />
                  <Skeleton width="50%" height={t.space[3]} />
                </View>
              </View>
            ))}
          </View>
        </>
      );
  }
}
