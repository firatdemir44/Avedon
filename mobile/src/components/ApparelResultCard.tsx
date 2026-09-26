// Konfeksiyon araması sonuç kartı (docs/konfeksiyon-plani.md Bölüm B, madde 6):
// firma + doğrulanmış rozeti, ana uzmanlık başlığı, diğer gruplar (kısa), mono-14
// "Kapasite 50.000/ay · MOQ 500 · Termin 30 gün", sertifika rozetleri (belgeliyse BELGELİ).
// Dokununca firmanın Üretim sekmesi; "Teklif iste" ayrı düğme (kendi firmasında yok).
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ApparelResult } from '../api/client';
import { EMPTY_PRODUCTION, productionSummaryLine } from '../features/companies/production';
import { companyTypeLabel } from '../features/products/catalog';
import { CompanyAvatar } from './CompanyAvatar';
import { Badge, Button, Card } from '../ui';
import { useTheme } from '../theme/ThemeContext';
import { tr } from '../i18n';

const MAX_OTHER_GROUPS = 3;

interface Props {
  result: ApparelResult;
  onPress: () => void;
  onRequestQuote?: () => void;
}

export function ApparelResultCard({ result, onPress, onRequestQuote }: Props) {
  const t = useTheme();
  const { company } = result;
  // Bölüm A'daki özet satırı; yalnızca dolu alanlar.
  const summary = productionSummaryLine({
    ...EMPTY_PRODUCTION,
    monthlyCapacity: result.monthlyCapacity,
    moqPerModel: result.moqPerModel,
    productionLeadDays: result.productionLeadDays,
  });
  const headline = result.mainGroups.map((g) => g.label).join(' · ');
  const others = result.productGroups.map((g) => g.label);
  const othersText =
    others.length > MAX_OTHER_GROUPS
      ? `${others.slice(0, MAX_OTHER_GROUPS).join(', ')} +${others.length - MAX_OTHER_GROUPS}`
      : others.join(', ');
  const meta = [company.city, companyTypeLabel(company.companyType), result.isOwn ? tr('Sizin firmanız') : ''].filter(Boolean).join(' · ');

  return (
    <Card>
      <View style={{ gap: t.space[3] }}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={company.name}
          style={({ pressed }) => [{ gap: t.space[2], borderRadius: t.radius.md }, pressed ? { backgroundColor: t.colors.surface2 } : null]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
            <CompanyAvatar
              name={company.name}
              verification={company.verification}
              companyId={company.id}
              logoUpdatedAt={company.logoUpdatedAt}
              size={t.size.avatar}
            />
            <View style={{ flex: 1, minWidth: 0, gap: t.space[1] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], flexWrap: 'wrap' }}>
                <Text style={[t.type.title18, { color: t.colors.ink, flexShrink: 1 }]} numberOfLines={1}>
                  {company.name}
                </Text>
                {company.verification === 'dogrulanmis' ? <Badge kind="verified" /> : null}
              </View>
              {meta ? <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{meta}</Text> : null}
            </View>
          </View>
          {headline ? <Text style={[t.type.body16, { color: t.colors.ink }]}>{headline}</Text> : null}
          {othersText ? (
            <Text style={[t.type.body14, { color: t.colors.ink2 }]} numberOfLines={1}>
              {tr('Ayrıca: {groups}', { groups: othersText })}
            </Text>
          ) : null}
          {summary ? <Text style={[t.type.mono14, { color: t.colors.ink }]}>{summary}</Text> : null}
          {result.certificates.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
              {result.certificates.map((c) =>
                c.documented ? (
                  <Badge key={c.key} kind="documented" label={`${c.label} · ${tr('BELGELİ')}`} />
                ) : (
                  <Badge key={c.key} kind="info" label={c.label} />
                )
              )}
            </View>
          ) : null}
        </Pressable>
        {onRequestQuote && !result.isOwn ? (
          <Button kind="secondary" icon="quote" label={tr('Teklif iste')} onPress={onRequestQuote} />
        ) : null}
      </View>
    </Card>
  );
}
