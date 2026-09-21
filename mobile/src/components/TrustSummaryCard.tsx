import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CompanyTrust, CompanyTrustRatings } from '../api/client';
import { SectionHeader } from './SectionHeader';
import { formatMonthYear } from '../features/time';
import { MIN_TOUCH, colors, fonts, spacing, typography } from '../theme';

// Faz 3, Adım 5: firma sayfasındaki "Güven özeti" kartı.
// Ürün sahibinin kararları (değiştirilmez):
//   - TEK PUAN YOK, yalnızca bileşenler gösterilir.
//   - Ödeme ile ilgili hiçbir ifade geçmez.
//   - Verisi az olan firma cezalandırılmaz: `null` gelen oran/ortalama için
//     uyarı/kırmızı renk kullanılmaz, nötr "Henüz yeterli veri yok" yazılır.

const NO_DATA = 'Henüz yeterli veri yok';

// "4,5 / 5" (virgül ondalık).
function scoreText(value: number | null | undefined): string | null {
  if (value == null) return null;
  return `${value.toFixed(1).replace('.', ',')} / 5`;
}

// "Eylül 2026'dan beri": ek yılın son rakamının okunuşuna göre.
const YEAR_SUFFIX = ['dan', 'den', 'den', 'ten', 'ten', 'ten', 'dan', 'den', 'den', 'dan'];

function memberSinceText(iso: string): string | null {
  const label = formatMonthYear(iso);
  if (!label) return null;
  const year = new Date(iso).getFullYear();
  const suffix = YEAR_SUFFIX[year % 10] ?? 'dan';
  return `${label}'${suffix} beri`;
}

function verificationText(verification: CompanyTrust['verification']): string {
  if (verification.status !== 'dogrulanmis') {
    return verification.status === 'inceleniyor' ? 'Doğrulama inceleniyor' : 'Henüz doğrulanmadı';
  }
  const level =
    verification.level === 'ziyaret'
      ? 'Yerinde ziyaretle doğrulandı'
      : verification.level === 'belge'
        ? 'Belge ile doğrulandı'
        : 'Doğrulandı';
  const when = verification.verifiedAt ? formatMonthYear(verification.verifiedAt) : '';
  return when ? `${level} · ${when}` : level;
}

// "tipik yanıt süresi 5 saat" / 48 saat ve üstünde gün olarak.
function responseTimeText(medianHours: number | null): string | null {
  if (medianHours == null) return null;
  if (medianHours >= 48) return `${Math.round(medianHours / 24)} gün`;
  if (medianHours < 1) return '1 saatten az';
  return `${Math.round(medianHours)} saat`;
}

function ratingRows(ratings: CompanyTrustRatings | null, keys: { key: keyof CompanyTrustRatings; label: string }[]) {
  if (!ratings) return [];
  return keys
    .map(({ key, label }) => ({ label, value: scoreText(ratings[key]) }))
    .filter((row): row is { label: string; value: string } => row.value !== null);
}

function TrustRow({ label, value, muted, last }: { label: string; value: string; muted?: boolean; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <Text style={styles.rowLabel}>{label}</Text>
      {/* Veri yoksa nötr gri: eksik veri bir kusur değil. */}
      <Text style={[styles.rowValue, muted && styles.rowValueMuted]}>{value}</Text>
    </View>
  );
}

export function TrustSummaryCard({ trust }: { trust: CompanyTrust }) {
  const [methodOpen, setMethodOpen] = useState(false);

  const since = memberSinceText(trust.memberSince);
  const seller = trust.asSeller;
  const buyer = trust.asBuyer;

  const sellerRatings = ratingRows(seller.ratings, [
    { key: 'quality', label: 'Kalite' },
    { key: 'timing', label: 'Termin' },
    { key: 'communication', label: 'İletişim' },
  ]);
  const buyerRatings = ratingRows(buyer.ratings, [
    { key: 'communication', label: 'İletişim' },
    { key: 'seriousness', label: 'İşin ciddiyeti' },
  ]);

  const responseTime = trust.quoteResponse ? responseTimeText(trust.quoteResponse.medianHours) : null;

  return (
    <View>
      <SectionHeader title="Güven özeti" />
      <View style={styles.block}>
        <TrustRow label="Doğrulama" value={verificationText(trust.verification)} />
        {since ? <TrustRow label="Platformda" value={since} /> : null}
        <TrustRow
          label="Onaylı referans"
          value={String(trust.confirmedReferenceCount)}
          last={seller.completedDeals === 0 && buyer.completedDeals === 0 && !trust.quoteResponse}
        />

        {/* --- Satıcı olarak --- */}
        <Text style={styles.groupTitle}>Satıcı olarak</Text>
        {seller.completedDeals === 0 ? (
          <TrustRow
            label="Tamamlanan iş"
            value="Henüz tamamlanan iş yok"
            muted
            last={buyer.completedDeals === 0 && !trust.quoteResponse}
          />
        ) : (
          <>
            <TrustRow label="Tamamlanan iş" value={String(seller.completedDeals)} />
            <TrustRow
              label="Zamanında teslim"
              value={
                seller.onTimeRate != null
                  ? `%${seller.onTimeRate}`
                  : `${NO_DATA} (en az ${trust.thresholds.deals} tamamlanan iş gerekir)`
              }
              muted={seller.onTimeRate == null}
              last={sellerRatings.length === 0 && buyer.completedDeals === 0 && !trust.quoteResponse}
            />
            {sellerRatings.length ? (
              <>
                {sellerRatings.map((row) => (
                  <TrustRow key={row.label} label={row.label} value={row.value} />
                ))}
                <TrustRow
                  label="Değerlendirme"
                  value={`${seller.reviewCount} değerlendirme`}
                  last={buyer.completedDeals === 0 && !trust.quoteResponse}
                />
              </>
            ) : (
              <TrustRow
                label="Değerlendirme"
                value={`${NO_DATA} (en az ${trust.thresholds.reviews} değerlendirme gerekir)`}
                muted
                last={buyer.completedDeals === 0 && !trust.quoteResponse}
              />
            )}
          </>
        )}

        {/* --- Alıcı olarak: yalnızca tamamlanmış işi varsa --- */}
        {buyer.completedDeals > 0 ? (
          <>
            <Text style={styles.groupTitle}>Alıcı olarak</Text>
            <TrustRow label="Tamamlanan iş" value={String(buyer.completedDeals)} />
            {buyerRatings.length ? (
              <>
                {buyerRatings.map((row) => (
                  <TrustRow key={row.label} label={row.label} value={row.value} />
                ))}
                <TrustRow label="Değerlendirme" value={`${buyer.reviewCount} değerlendirme`} last={!trust.quoteResponse} />
              </>
            ) : (
              <TrustRow
                label="Değerlendirme"
                value={`${NO_DATA} (en az ${trust.thresholds.reviews} değerlendirme gerekir)`}
                muted
                last={!trust.quoteResponse}
              />
            )}
          </>
        ) : null}

        {/* --- Tekliflere yanıt: veri yoksa satır hiç çizilmez --- */}
        {trust.quoteResponse ? (
          <TrustRow
            label="Tekliflere yanıt"
            value={
              responseTime
                ? `Tekliflerin %${trust.quoteResponse.responseRate}'ine yanıt veriyor · tipik yanıt süresi ${responseTime}`
                : `Tekliflerin %${trust.quoteResponse.responseRate}'ine yanıt veriyor`
            }
            last
          />
        ) : null}
      </View>

      {/* Hesap yöntemi açık: küçük, açılır satır. */}
      <Pressable
        onPress={() => setMethodOpen((open) => !open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: methodOpen }}
        accessibilityLabel="Güven özeti nasıl hesaplanıyor"
        style={({ pressed }) => [styles.methodToggle, pressed && styles.pressedFade]}
      >
        <Text style={styles.methodToggleText}>Nasıl hesaplanıyor?</Text>
        <Ionicons name={methodOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
      </Pressable>
      {methodOpen ? <Text style={styles.methodText}>{trust.method}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.surface },
  row: {
    paddingHorizontal: spacing.gutter,
    paddingVertical: 10,
    gap: 2,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowLabel: { ...typography.caption, color: colors.textMuted },
  rowValue: { ...typography.label, color: colors.text },
  rowValueMuted: { fontFamily: fonts.regular, color: colors.textMuted },
  groupTitle: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
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
