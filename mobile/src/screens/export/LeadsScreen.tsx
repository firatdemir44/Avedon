// Aday alıcı takip listesi: firmanın işaretlediği alıcılar, duruma göre gruplu.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, RefreshControl, ScrollView, Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { fetchBuyerLeads, type BuyerLeadItem, type BuyerLeadStatus } from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { useTheme } from '../../theme/ThemeContext';
import { AppBar, Badge, Button, ButtonRow, Card, EmptyState, SectionTitle, SkeletonRow, useBottomPadding } from '../../ui';
import { LEAD_STATUS, LeadStatusSheet } from './buyerShared';

type Props = RootStackScreenProps<'ExportLeads'>;

export function LeadsScreen({ navigation }: Props) {
  const t = useTheme();
  const bottom = useBottomPadding();
  const [leads, setLeads] = useState<BuyerLeadItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<BuyerLeadItem | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    setError(null);
    try {
      const res = await fetchBuyerLeads();
      setLeads(res.leads);
    } catch (err) {
      setError(friendlyMessage(err, 'Takip listesi alınamadı'));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(
    () => LEAD_STATUS.map((s) => ({ ...s, items: (leads ?? []).filter((l) => l.status === s.key) })).filter((g) => g.items.length),
    [leads]
  );

  const sheetBuyer = useMemo(
    () => (editing ? { id: editing.buyer.id, name: editing.buyer.name, lead: { status: editing.status, note: editing.note } } : null),
    [editing]
  );

  const onSaved = (buyerId: string, lead: { status: BuyerLeadStatus; note: string }) =>
    setLeads((prev) => (prev ?? []).map((l) => (l.buyer.id === buyerId ? { ...l, ...lead, updatedAt: new Date().toISOString() } : l)));

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title="Takip listem" leading="back" onBack={() => navigation.goBack()} />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={t.colors.brand} />}
        contentContainerStyle={{ paddingHorizontal: t.space[4], paddingTop: t.space[4], paddingBottom: bottom, gap: t.space[6], maxWidth: t.size.maxContentWidth, width: '100%', alignSelf: 'center' }}
      >
        {error ? (
          <EmptyState icon="warning" title="Liste alınamadı" description={error} actionLabel="Tekrar dene" onAction={() => load()} />
        ) : leads === null ? (
          <View style={{ gap: t.space[3] }}>
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : leads.length === 0 ? (
          <EmptyState
            icon="bookmark-outline"
            title="Takip ettiğiniz alıcı yok"
            description="Dünyayı Keşfet'te bir ülkenin aday alıcılarından birini 'Takibe al' ile buraya ekleyin."
            actionLabel="Dünyayı Keşfet"
            onAction={() => navigation.navigate('ExportRadar')}
          />
        ) : (
          groups.map((g) => (
            <View key={g.key} style={{ gap: t.space[3] }}>
              <SectionTitle title={`${g.label} · ${g.items.length}`} />
              {g.items.map((l) => (
                <Card key={l.id}>
                  <View style={{ gap: t.space[2] }}>
                    <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>{l.buyer.name}</Text>
                    <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                      {[l.buyer.countryName, l.buyer.city, l.buyer.sizeLabel].filter(Boolean).join(' · ')}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: t.space[2], flexWrap: 'wrap' }}>
                      <Badge kind="info" label={l.buyer.segmentLabel} />
                      <Badge kind={g.badge} label={g.label} />
                    </View>
                    {l.note ? <Text style={[t.type.body14, { color: t.colors.ink }]}>Not: {l.note}</Text> : null}
                    <ButtonRow>
                      <Button kind="secondary" icon="bookmark-outline" label="Durumu değiştir" onPress={() => setEditing(l)} />
                      <Button
                        kind="quiet"
                        icon="open-outline"
                        label={l.buyer.website ? 'Web sitesi' : 'Sicil kaydı'}
                        onPress={() => Linking.openURL(l.buyer.website ?? l.buyer.sourceUrl).catch(() => {})}
                      />
                    </ButtonRow>
                    <Text style={[t.type.body14, { color: t.colors.ink3 }]}>{l.buyer.sourceLabel}</Text>
                  </View>
                </Card>
              ))}
            </View>
          ))
        )}
      </ScrollView>
      <LeadStatusSheet
        buyer={sheetBuyer}
        onClose={() => setEditing(null)}
        onSaved={onSaved}
      />
    </View>
  );
}
