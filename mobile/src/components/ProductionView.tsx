import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, ActivityIndicator } from 'react-native';
import type { ProductionReferenceItem, ProductionView as ProductionData } from '../api/client';
import {
  getCachedReferenceImage,
  isProductionEmpty,
  loadReferenceImage,
  optionLabel,
  productionSummaryLine,
} from '../features/companies/production';
import { ImageViewerModal } from './ImageViewerModal';
import { Badge, Button, Card, Chip, ChipRow, EmptyState, SectionTitle } from '../ui';
import { useTheme } from '../theme/ThemeContext';
import { tr } from '../i18n';

interface Props {
  companyId: string;
  companyType: string;
  data: ProductionData;
  isOwn: boolean;
  onEdit: () => void;
}

// Firma sayfası "Üretim" sekmesi (docs/konfeksiyon-plani.md Bölüm A). Boş alanlar gizlenir.
export function ProductionView({ companyId, companyType, data, isOwn, onEdit }: Props) {
  const t = useTheme();
  const { production: p, references, options } = data;
  const atolye = companyType === 'fason_atolye';

  if (isProductionEmpty(p, references.length)) {
    return (
      <Card>
        <EmptyState
          icon="construct-outline"
          title={isOwn ? tr('Üretim bilgilerini ekle') : tr('Firma üretim bilgilerini henüz eklemedi')}
          description={
            isOwn
              ? tr('Ürün gruplarınızı, kapasitenizi, minimum siparişinizi ve terminlerinizi yazın; alıcılar sizi daha kolay bulur.')
              : undefined
          }
          actionLabel={isOwn ? tr('Üretim bilgilerini ekle') : undefined}
          onAction={isOwn ? onEdit : undefined}
        />
      </Card>
    );
  }

  const main = p.mainGroups.map((k) => optionLabel(options.productGroups, k));
  const otherGroups = p.productGroups.filter((k) => !p.mainGroups.includes(k)).map((k) => optionLabel(options.productGroups, k));
  const summary = productionSummaryLine(p);
  const byGroup = Object.entries(p.capacityByGroup);
  const muted = [t.type.body14, { color: t.colors.ink2 }];

  const chips = (labels: string[]) => (
    <ChipRow wrap>
      {labels.map((label) => (
        <Chip key={label} label={label} />
      ))}
    </ChipRow>
  );

  const infoRow = (label: string, value: string) => (
    <View style={{ gap: t.space[1] }}>
      <Text style={muted}>{label}</Text>
      <Text style={[t.type.body16, { color: t.colors.ink }]}>{value}</Text>
    </View>
  );

  return (
    <View style={{ gap: t.space[4] }}>
      <Card>
        <View style={{ gap: t.space[3] }}>
          {main.length ? (
            <View style={{ gap: t.space[1] }}>
              <Text style={muted}>{tr('Ana uzmanlık')}</Text>
              <Text style={[t.type.title18, { color: t.colors.ink }]}>{main.join(' · ')}</Text>
            </View>
          ) : null}
          {otherGroups.length || p.groupsOther.trim() ? (
            <View style={{ gap: t.space[2] }}>
              <Text style={muted}>{main.length ? tr('Diğer ürün grupları') : tr('Ürün grupları')}</Text>
              {chips([...otherGroups, ...(p.groupsOther.trim() ? [p.groupsOther.trim()] : [])])}
            </View>
          ) : null}
          {summary ? <Text style={[t.type.mono14, { color: t.colors.ink }]}>{summary}</Text> : null}
          {byGroup.length ? (
            <View style={{ gap: t.space[1] }}>
              {byGroup.map(([key, n]) => (
                <Text key={key} style={[t.type.mono14, { color: t.colors.ink2 }]}>
                  {`${optionLabel(options.productGroups, key)} ${tr('{n}/ay', { n: n.toLocaleString() })}`}
                </Text>
              ))}
            </View>
          ) : null}
          {p.workMode ? infoRow(tr('Çalışma şekli'), optionLabel(options.workModes, p.workMode)) : null}
          {atolye && p.fabricMode ? infoRow(tr('İş şekli'), optionLabel(options.fabricModes, p.fabricMode)) : null}
          {p.employeeRange ? infoRow(tr('Çalışan sayısı'), optionLabel(options.employeeRanges, p.employeeRange)) : null}
        </View>
      </Card>

      {atolye && p.operations.length ? (
        <View style={{ gap: t.space[2] }}>
          <SectionTitle title={tr('Yapılan işlemler')} />
          {chips(p.operations.map((k) => optionLabel(options.operations, k)))}
        </View>
      ) : null}

      {p.services.length ? (
        <View style={{ gap: t.space[2] }}>
          <SectionTitle title={tr('Hizmetler')} />
          {chips(p.services.map((k) => optionLabel(options.services, k)))}
        </View>
      ) : null}

      {p.certificates.length ? (
        <View style={{ gap: t.space[2] }}>
          <SectionTitle title={tr('Sertifikalar')} />
          <Card>
            <View style={{ gap: t.space[3] }}>
              {p.certificates.map((c) => (
                <View key={c.key} style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], flexWrap: 'wrap' }}>
                  <Text style={[t.type.body16, { color: t.colors.ink, flexShrink: 1 }]}>{optionLabel(options.certificates, c.key)}</Text>
                  {c.documented ? <Badge kind="documented" /> : null}
                </View>
              ))}
            </View>
          </Card>
        </View>
      ) : null}

      {p.exportCountries.length ? (
        <View style={{ gap: t.space[2] }}>
          <SectionTitle title={tr('İhracat pazarları')} />
          {chips(p.exportCountries.map((k) => options.countries.find((c) => c.key === k)?.name ?? k))}
        </View>
      ) : null}

      {references.length ? (
        <View style={{ gap: t.space[2] }}>
          <SectionTitle title={tr('Referans işler ({n})', { n: references.length })} />
          <ReferenceGrid companyId={companyId} references={references} />
        </View>
      ) : null}

      {isOwn ? <Button kind="secondary" icon="create-outline" label={tr('Üretimi düzenle')} onPress={onEdit} /> : null}
    </View>
  );
}

// 3 sütunlu referans galerisi; dokununca tam ekran.
export function ReferenceGrid({
  companyId,
  references,
  onRemove,
}: {
  companyId: string;
  references: ProductionReferenceItem[];
  onRemove?: (position: number) => void;
}) {
  const t = useTheme();
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const initial: Record<number, string> = {};
    references.forEach((r) => {
      const cached = getCachedReferenceImage(companyId, r.position);
      if (cached) initial[r.position] = cached;
      else
        loadReferenceImage(companyId, r.position)
          .then((url) => {
            if (!cancelled) setUrls((prev) => ({ ...prev, [r.position]: url }));
          })
          .catch(() => {});
    });
    setUrls(initial);
    return () => {
      cancelled = true;
    };
  }, [companyId, references]);

  const rows: ProductionReferenceItem[][] = [];
  for (let i = 0; i < references.length; i += 3) rows.push(references.slice(i, i + 3));

  return (
    <View style={{ gap: t.space[3] }}>
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: t.space[2] }}>
          {[0, 1, 2].map((ci) => {
            const r = row[ci];
            if (!r) return <View key={ci} style={{ flex: 1 }} />;
            const url = urls[r.position];
            return (
              <View key={ci} style={{ flex: 1, gap: t.space[1], minWidth: 0 }}>
                <Pressable
                  onPress={() => url && setViewerUrl(url)}
                  disabled={!url}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={r.caption || tr('Referans iş')}
                  accessibilityHint={tr('Tam ekran büyütür')}
                  style={({ pressed }) => ({
                    aspectRatio: 1,
                    borderRadius: t.radius.sm,
                    borderWidth: 1,
                    borderColor: t.colors.line,
                    backgroundColor: t.colors.surface2,
                    overflow: 'hidden',
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  {url ? (
                    <Image source={{ uri: url }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <ActivityIndicator color={t.colors.ink3} />
                    </View>
                  )}
                </Pressable>
                {r.caption ? (
                  <Text numberOfLines={2} style={[t.type.body14, { color: t.colors.ink }]}>
                    {r.caption}
                  </Text>
                ) : null}
                {r.clientName && (r.showClient || onRemove) ? (
                  <Text numberOfLines={1} style={[t.type.caption12, { color: t.colors.ink2 }]}>
                    {r.showClient ? r.clientName : tr('{name} (gizli)', { name: r.clientName })}
                  </Text>
                ) : null}
                {onRemove ? (
                  <Button kind="quiet" icon="trash-outline" label={tr('Sil')} onPress={() => onRemove(r.position)} />
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
      <ImageViewerModal imageUrl={viewerUrl} visible={!!viewerUrl} onClose={() => setViewerUrl(null)} />
    </View>
  );
}
