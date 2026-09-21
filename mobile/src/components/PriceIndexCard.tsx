import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchPriceIndex, type PriceIndex, type PriceIndexBand } from '../api/client';
import { SectionHeader } from './SectionHeader';
import { formatMeasure, formatNumber } from '../features/calculators/parse';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../theme';

// Faz 3, Adım 6: anonim fiyat / termin endeksi kartı ("Piyasa aralığı").
// Ürün kuralları (sunucuyla aynı, değiştirilmez):
//   - Tek tek teklif, firma adı, en düşük/en yüksek değer GÖSTERİLMEZ;
//     yalnızca çeyrek aralığı (p25-p75) ve ortanca.
//   - Fiyatlar kg başınadır, para birimi ÇEVRİLMEZ: her para birimi ayrı satır.
//   - `myPosition` yalnızca satıcıya gelir ve NÖTR anlatılır: "altında/içinde/
//     üstünde" denir, iyi ya da kötü denmez, uyarı rengi kullanılmaz.
// Veri kendi içinde, AYRI ve SESSİZ istekle gelir (benzer kumaşlar / dijital
// pasaport deseni): hata olursa ya da oturum yoksa kart hiç çizilmez.

const POSITION_TEXT: Record<'below' | 'within' | 'above', string> = {
  below: 'Teklifleriniz bu aralığın altında',
  within: 'Teklifleriniz bu aralığın içinde',
  above: 'Teklifleriniz bu aralığın üstünde',
};

// "3,10 – 3,35 USD/kg" (iki ondalık; virgül ondalık ayracı).
const priceRange = (band: PriceIndexBand) =>
  `${formatNumber(band.price.p25, 2)} – ${formatNumber(band.price.p75, 2)} ${band.currency}/${band.unit}`;

// Yatay ince bant: p25-p75 dolu, ortanca çizgi. Kütüphane yok, saf View.
// Ölçek aralığın biraz dışına taşırılır ki dolu kısım kenara yapışmasın.
function BandBar({ price }: { price: PriceIndexBand['price'] }) {
  const span = price.p75 - price.p25;
  const pad = span > 0 ? span * 0.5 : Math.max(price.median * 0.1, 0.01);
  const min = price.p25 - pad;
  const max = price.p75 + pad;
  const pct = (value: number) => ((value - min) / (max - min)) * 100;
  const left = pct(price.p25);
  const width = Math.max(pct(price.p75) - left, 1);
  return (
    // Görsel yalnızca süsleme: her sayı zaten metinde yazılı.
    <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.trackFill, { left: `${left}%`, width: `${width}%` }]} />
      <View style={[styles.trackMedian, { left: `${pct(price.median)}%` }]} />
    </View>
  );
}

function Band({ band, last }: { band: PriceIndexBand; last: boolean }) {
  return (
    <View style={[styles.band, !last && styles.bandDivider]}>
      <Text style={styles.bandPrice}>
        {priceRange(band)} <Text style={styles.bandMedian}>· ortanca {formatNumber(band.price.median, 2)}</Text>
      </Text>
      <BandBar price={band.price} />
      {band.leadTimeDays ? (
        <Text style={styles.bandLead}>
          Tipik termin {formatMeasure(band.leadTimeDays.p25)}–{formatMeasure(band.leadTimeDays.p75)} gün
        </Text>
      ) : null}
      <Text style={styles.bandSample}>({band.sampleSize} teklif)</Text>
      {band.myPosition ? <Text style={styles.bandPosition}>{POSITION_TEXT[band.myPosition]}</Text> : null}
    </View>
  );
}

export function PriceIndexCard({
  productId,
  subtitle,
  hideWhenUnavailable,
}: {
  productId: string;
  // Başlığın hemen altındaki küçük not (karşılaştırma tablosunda
  // "İlk üründeki kaliteye göre"); kart gizlenirse not da görünmez.
  subtitle?: string;
  // Ürün sayfası ve alıcı görünümü gibi yerlerde veri yokken kart hiç çizilmez
  // (sayfa kalabalıklaşmasın). Satıcıya "henüz veri yok" da gösterilir.
  hideWhenUnavailable?: boolean;
}) {
  const [index, setIndex] = useState<PriceIndex | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIndex(null);
    setOpen(false);
    fetchPriceIndex(productId)
      .then((result) => {
        if (!cancelled) setIndex(result);
      })
      .catch(() => {
        // Sessiz: oturumsuz kullanıcıda (401) ve hatada kart hiç görünmez.
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (!index) return null;
  if (!index.available && hideWhenUnavailable) return null;

  return (
    <View>
      <SectionHeader title="Piyasa aralığı" />
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={styles.block}>
        <Text style={styles.cluster}>{index.cluster.label}</Text>
        <Text style={styles.window}>son {index.cluster.windowDays} gün</Text>

        {index.available ? (
          index.bands.map((band, position) => (
            <Band key={band.currency} band={band} last={position === index.bands.length - 1} />
          ))
        ) : (
          // Nötr: veri azlığı bir kusur değil, uyarı rengi kullanılmaz.
          <Text style={styles.empty}>
            Bu kalite için henüz yeterli teklif birikmedi. En az {index.rules.minSellers} farklı satıcıdan{' '}
            {index.rules.minQuotes} teklif olunca aralık görünür.
          </Text>
        )}
      </View>

      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="Piyasa aralığı nasıl hesaplanıyor"
        style={({ pressed }) => [styles.methodToggle, pressed && styles.pressedFade]}
      >
        <Text style={styles.methodToggleText}>Nasıl hesaplanıyor?</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
      </Pressable>
      {open ? <Text style={styles.methodText}>{index.note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
    paddingBottom: 6,
    marginTop: -2,
  },
  block: { backgroundColor: colors.surface, paddingTop: 10 },
  cluster: { ...typography.label, fontFamily: fonts.semibold, color: colors.text, paddingHorizontal: spacing.gutter },
  window: { ...typography.caption, color: colors.textMuted, paddingHorizontal: spacing.gutter, paddingBottom: spacing.sm },
  band: { paddingHorizontal: spacing.gutter, paddingVertical: 10, gap: 4 },
  bandDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  bandPrice: { ...typography.mono, fontFamily: fonts.monoSemibold, fontSize: 16, lineHeight: 22, color: colors.primary },
  bandMedian: { ...typography.mono, fontSize: 13, lineHeight: 22, color: colors.textMuted },
  track: {
    height: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.chip,
    overflow: 'hidden',
    marginVertical: 2,
  },
  trackFill: { position: 'absolute', top: 0, bottom: 0, backgroundColor: colors.accentSoft },
  trackMedian: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.primary },
  bandLead: { ...typography.label, fontFamily: fonts.regular, color: colors.text },
  bandSample: { ...typography.caption, fontSize: 11, lineHeight: 15, color: colors.textMuted },
  // Nötr: satıcının yerini bildirir, yargı bildirmez (uyarı rengi yok).
  bandPosition: { ...typography.caption, color: colors.textMuted },
  empty: {
    ...typography.label,
    fontFamily: fonts.regular,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.sm,
  },
  methodToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.gutter,
  },
  methodToggleText: { ...typography.caption, fontFamily: fonts.semibold, color: colors.textMuted },
  methodText: { ...typography.caption, color: colors.textMuted, paddingHorizontal: spacing.gutter, paddingBottom: spacing.sm },
  pressedFade: { opacity: 0.6 },
});
