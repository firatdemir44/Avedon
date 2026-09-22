import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import type { CompanyTrust, CompanyTrustRatings } from '../api/client';
import { Card, Icon, SectionTitle } from '../ui';
import { formatMonthYear } from '../features/time';
import { useTheme } from '../theme/ThemeContext';

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
  const t = useTheme();
  return (
    <View
      style={{
        paddingVertical: t.space[3],
        gap: t.space[1] / 2,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: t.colors.line,
      }}
    >
      <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{label}</Text>
      {/* Veri yoksa nötr ton: eksik veri bir kusur değil. */}
      <Text style={[muted ? t.type.body16 : t.type.body16Strong, { color: muted ? t.colors.ink2 : t.colors.ink }]}>
        {value}
      </Text>
    </View>
  );
}

function GroupTitle({ children }: { children: string }) {
  const t = useTheme();
  return (
    <Text style={[t.type.label14, { color: t.colors.ink2, paddingTop: t.space[4], paddingBottom: t.space[1] }]}>
      {children}
    </Text>
  );
}

export function TrustSummaryCard({ trust }: { trust: CompanyTrust }) {
  const t = useTheme();
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
    <View style={{ gap: t.space[3] }}>
      <SectionTitle title="Güven özeti" />
      <Card>
        <TrustRow label="Doğrulama" value={verificationText(trust.verification)} />
        {since ? <TrustRow label="Platformda" value={since} /> : null}
        <TrustRow
          label="Onaylı referans"
          value={String(trust.confirmedReferenceCount)}
          last={seller.completedDeals === 0 && buyer.completedDeals === 0 && !trust.quoteResponse}
        />

        {/* --- Satıcı olarak --- */}
        <GroupTitle>Satıcı olarak</GroupTitle>
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
            <GroupTitle>Alıcı olarak</GroupTitle>
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
      </Card>

      {/* Hesap yöntemi açık: küçük, açılır satır (44px dokunma hedefi). */}
      <Pressable
        onPress={() => setMethodOpen((open) => !open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: methodOpen }}
        accessibilityLabel="Güven özeti nasıl hesaplanıyor"
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[1],
          minHeight: t.size.touchMin,
          alignSelf: 'flex-start',
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text style={[t.type.label14, { color: t.colors.brand }]}>Nasıl hesaplanıyor?</Text>
        <Icon name={methodOpen ? 'chevron-up-outline' : 'chevron-down-outline'} size={t.size.iconSm} color="brand" />
      </Pressable>
      {methodOpen ? <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{trust.method}</Text> : null}
    </View>
  );
}
