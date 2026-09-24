import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { fetchPriceIndex, type PriceIndex, type PriceIndexBand } from '../api/client';
import { Card, Icon, SectionTitle } from '../ui';
import { formatMeasure, formatNumber } from '../features/calculators/parse';
import { useTheme } from '../theme/ThemeContext';
import { tr } from '../i18n';

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

// Bant yüksekliği ve ortanca çizgisi (DESIGN.md'de adı olmayan ekran-içi ölçü).
const TRACK_HEIGHT = 6;
const MEDIAN_WIDTH = 2;

// Yatay ince bant: p25-p75 dolu, ortanca çizgi. Kütüphane yok, saf View.
// Ölçek aralığın biraz dışına taşırılır ki dolu kısım kenara yapışmasın.
function BandBar({ price }: { price: PriceIndexBand['price'] }) {
  const t = useTheme();
  const span = price.p75 - price.p25;
  const pad = span > 0 ? span * 0.5 : Math.max(price.median * 0.1, 0.01);
  const min = price.p25 - pad;
  const max = price.p75 + pad;
  const pct = (value: number) => ((value - min) / (max - min)) * 100;
  const left = pct(price.p25);
  const width = Math.max(pct(price.p75) - left, 1);
  return (
    // Görsel yalnızca süsleme: her sayı zaten metinde yazılı.
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        height: TRACK_HEIGHT,
        borderRadius: t.radius.full,
        backgroundColor: t.colors.surface2,
        overflow: 'hidden',
        marginVertical: t.space[1] / 2,
      }}
    >
      <View
        style={{ position: 'absolute', top: 0, bottom: 0, backgroundColor: t.colors.brandSoft, left: `${left}%`, width: `${width}%` }}
      />
      <View
        style={{ position: 'absolute', top: 0, bottom: 0, width: MEDIAN_WIDTH, backgroundColor: t.colors.brand, left: `${pct(price.median)}%` }}
      />
    </View>
  );
}

function Band({ band, last }: { band: PriceIndexBand; last: boolean }) {
  const t = useTheme();
  return (
    <View
      style={{
        paddingVertical: t.space[3],
        gap: t.space[1],
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: t.colors.line,
      }}
    >
      <Text style={[t.type.mono20, { color: t.colors.brand }]}>
        {priceRange(band)}{' '}
        <Text style={[t.type.mono14, { color: t.colors.ink2 }]}>· {tr('ortanca {n}', { n: formatNumber(band.price.median, 2) })}</Text>
      </Text>
      <BandBar price={band.price} />
      {band.leadTimeDays ? (
        <Text style={[t.type.body16, { color: t.colors.ink }]}>
          {tr('Tipik termin {a}–{b} gün', { a: formatMeasure(band.leadTimeDays.p25), b: formatMeasure(band.leadTimeDays.p75) })}
        </Text>
      ) : null}
      <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{tr('({n} teklif)', { n: band.sampleSize })}</Text>
      {/* Nötr: satıcının yerini bildirir, yargı bildirmez (uyarı rengi yok). */}
      {band.myPosition ? (
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{tr(POSITION_TEXT[band.myPosition])}</Text>
      ) : null}
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
  const t = useTheme();
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
    <View style={{ gap: t.space[3] }}>
      <SectionTitle title={tr('Piyasa aralığı')} />
      {subtitle ? <Text style={[t.type.body14, { color: t.colors.ink2, marginTop: -t.space[2] }]}>{subtitle}</Text> : null}
      <Card>
        <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>{index.cluster.label}</Text>
        <Text style={[t.type.body14, { color: t.colors.ink2, paddingBottom: t.space[2] }]}>
          {tr('son {n} gün', { n: index.cluster.windowDays })}
        </Text>

        {index.available ? (
          index.bands.map((band, position) => (
            <Band key={band.currency} band={band} last={position === index.bands.length - 1} />
          ))
        ) : (
          // Nötr: veri azlığı bir kusur değil, uyarı rengi kullanılmaz.
          <Text style={[t.type.body16, { color: t.colors.ink2 }]}>
            {tr('Bu kalite için henüz yeterli teklif birikmedi. En az {s} farklı satıcıdan {q} teklif olunca aralık görünür.', {
              s: index.rules.minSellers,
              q: index.rules.minQuotes,
            })}
          </Text>
        )}
      </Card>

      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={tr('Piyasa aralığı nasıl hesaplanıyor')}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[1],
          minHeight: t.size.touchMin,
          alignSelf: 'flex-start',
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text style={[t.type.label14, { color: t.colors.brand }]}>{tr('Nasıl hesaplanıyor?')}</Text>
        <Icon name={open ? 'chevron-up-outline' : 'chevron-down-outline'} size={t.size.iconSm} color="brand" />
      </Pressable>
      {open ? <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{index.note}</Text> : null}
    </View>
  );
}
