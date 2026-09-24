// Dünyayı Keşfet — B aşaması: aday alıcı listesi (docs/kesfet-ihracat-plani.md §2.3).
// Sunucu eksik/eski kaynakları arka planda çeker; `pending` true iken 5 sn'de bir yeniden sorulur
// (en çok ~2 dk). Kartta puan, 2-3 gerekçe, web sitesi, kaynak/lisans satırı ve takip durumu.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Linking, RefreshControl, Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { locale, tr } from '../../i18n';
import { fetchExportBuyers, type BuyerLeadStatus, type BuyerSegment, type ExportBuyer, type ExportBuyersResult } from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import { AppBar, Badge, Button, ButtonRow, Card, Chip, ChipRow, EmptyState, Icon, SkeletonRow, useBottomPadding } from '../../ui';
import { LeadStatusSheet, leadStatusOf, scoreColor } from './buyerShared';

type Props = RootStackScreenProps<'ExportBuyers'>;

const POLL_MS = 5000;
const POLL_MAX = 24; // ~2 dk

const hsDisplay = (hs6: string) => `${hs6.slice(0, 4)}.${hs6.slice(4)}`;

export function BuyerListScreen({ navigation, route }: Props) {
  const t = useTheme();
  const bottom = useBottomPadding();
  const { hs6, hsLabel, country, countryName } = route.params;
  const [segment, setSegment] = useState<BuyerSegment | null>(null);
  const [data, setData] = useState<ExportBuyersResult | null>(null);
  const [buyers, setBuyers] = useState<ExportBuyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollGaveUp, setPollGaveUp] = useState(false);
  const [editing, setEditing] = useState<ExportBuyer | null>(null);
  const seq = useRef(0);

  // İlk sayfa; bekleyen kaynak varsa yoklar. Yeni bir yükleme eskisini geçersiz kılar.
  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      const id = ++seq.current;
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      setError(null);
      setPollGaveUp(false);
      let tries = 0;
      const run = async (): Promise<void> => {
        try {
          const res = await fetchExportBuyers(hs6, country, { segment });
          if (id !== seq.current) return;
          setData(res);
          setBuyers(res.buyers);
          setLoading(false);
          setRefreshing(false);
          if (res.pending) {
            if (tries >= POLL_MAX) {
              setPollGaveUp(true);
              return;
            }
            tries += 1;
            await new Promise((r) => setTimeout(r, POLL_MS));
            if (id === seq.current) return run();
          }
        } catch (err) {
          if (id !== seq.current) return;
          setLoading(false);
          setRefreshing(false);
          setError(friendlyMessage(err, tr('Aday alıcılar alınamadı')));
        }
      };
      await run();
    },
    [hs6, country, segment]
  );

  useEffect(() => {
    load('initial');
  }, [load]);
  // Ekrandan çıkınca yoklama dursun.
  useEffect(
    () => () => {
      seq.current += 1;
    },
    []
  );

  const loadMore = async () => {
    if (!data || loadingMore || buyers.length >= data.total) return;
    setLoadingMore(true);
    try {
      const res = await fetchExportBuyers(hs6, country, { segment, page: Math.floor(buyers.length / data.pageSize) + 1 });
      setBuyers((prev) => {
        const seen = new Set(prev.map((b) => b.id));
        return [...prev, ...res.buyers.filter((b) => !seen.has(b.id))];
      });
      setData((d) => (d ? { ...d, total: res.total } : res));
    } catch (err) {
      setError(friendlyMessage(err, tr('Devamı alınamadı')));
    } finally {
      setLoadingMore(false);
    }
  };

  const onSaved = (buyerId: string, lead: { status: BuyerLeadStatus; note: string }) =>
    setBuyers((prev) => prev.map((b) => (b.id === buyerId ? { ...b, lead } : b)));

  const header = (
    <View style={{ gap: t.space[4], paddingTop: t.space[4], paddingBottom: t.space[4] }}>
      <View style={{ gap: t.space[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], flexWrap: 'wrap' }}>
          <Text style={[t.type.mono14, { color: t.colors.ink }]}>{tr('GTİP {code}', { code: hsDisplay(hs6) })}</Text>
          <Badge kind="info" label={tr('Pilot erişim')} />
        </View>
        {hsLabel ? <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{hsLabel}</Text> : null}
        {data ? <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{data.note}</Text> : null}
      </View>
      {data && data.segments.length > 1 ? (
        <ChipRow>
          <Chip
            label={tr('Tümü')}
            selected={segment === null}
            onPress={() => {
              haptics.selection();
              setSegment(null);
            }}
          />
          {data.segments.map((s) => (
            <Chip
              key={s.key}
              label={segment === null ? `${s.label} · ${s.count}` : s.label}
              selected={segment === s.key}
              onPress={() => {
                haptics.selection();
                setSegment(segment === s.key ? null : s.key);
              }}
            />
          ))}
        </ChipRow>
      ) : null}
      {data?.pending && !pollGaveUp ? (
        <Card>
          <View style={{ gap: t.space[3] }}>
            <View style={{ flexDirection: 'row', gap: t.space[2], alignItems: 'center' }}>
              <Icon name="time-outline" color="ink2" size={t.size.iconSm} />
              <Text style={[t.type.label14, { color: t.colors.ink, flex: 1 }]}>{tr('Kayıtlar getiriliyor…')}</Text>
            </View>
            <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
              {tr('İlk açılışta açık sicillerden firma listesi çekiliyor (1-2 dakika). Liste kendiliğinden güncellenecek.')}
            </Text>
            {buyers.length === 0 ? <SkeletonRow /> : null}
          </View>
        </Card>
      ) : null}
      {pollGaveUp ? (
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{tr('Kayıtların bir kısmı hâlâ geliyor; birkaç dakika sonra aşağı çekerek yenileyin.')}</Text>
      ) : null}
      {data && data.total > 0 ? (
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
          {tr('{n} aday · puana göre sıralı', { n: data.total.toLocaleString(locale()) })}
        </Text>
      ) : null}
    </View>
  );

  const empty = loading ? (
    <View style={{ gap: t.space[3] }}>
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
    </View>
  ) : error ? (
    <EmptyState icon="warning" title={tr('Liste alınamadı')} description={error} actionLabel={tr('Tekrar dene')} onAction={() => load('initial')} />
  ) : data?.pending && !pollGaveUp ? null : (
    <EmptyState
      icon="people-outline"
      title={tr('Bu ülke için aday bulunamadı')}
      description={
        data?.coverage.registry
          ? tr('Seçili ürün türüne uyan kayıtlı firma çıkmadı. Başka bir ürün kodu ya da ülke deneyin.')
          : tr("{country} için ücretsiz açık firma sicili yok; yalnızca Wikidata'daki bilinen markalar gösterilebiliyor ve bu ürüne uyan kayıt çıkmadı.", { country: countryName })
      }
      actionLabel={tr('Başka ülke seç')}
      onAction={() => navigation.goBack()}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar
        title={tr('Aday alıcılar · {country}', { country: countryName })}
        leading="back"
        onBack={() => navigation.goBack()}
        actions={[{ icon: 'bookmark-outline', label: tr('Takip listem'), onPress: () => navigation.navigate('ExportLeads') }]}
      />
      <FlatList
        data={buyers}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => <BuyerCard buyer={item} onStatus={() => setEditing(item)} />}
        ItemSeparatorComponent={() => <View style={{ height: t.space[3] }} />}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          data && buyers.length > 0 && buyers.length < data.total ? (
            <View style={{ paddingTop: t.space[4] }}>
              <Button kind="secondary" label={tr('Daha fazla göster')} onPress={loadMore} loading={loadingMore} fullWidth />
            </View>
          ) : null
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={t.colors.brand} />}
        contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: bottom, maxWidth: t.size.maxContentWidth, width: '100%', alignSelf: 'center' }}
      />
      <LeadStatusSheet buyer={editing} onClose={() => setEditing(null)} onSaved={onSaved} />
    </View>
  );
}

function BuyerCard({ buyer, onStatus }: { buyer: ExportBuyer; onStatus: () => void }) {
  const t = useTheme();
  const status = buyer.lead ? leadStatusOf(buyer.lead.status) : null;
  const subtitle = [buyer.city, buyer.sizeLabel, buyer.foundedYear ? tr("{year}'den beri", { year: buyer.foundedYear }) : null].filter(Boolean).join(' · ');
  // İlk gerekçe sicil/faaliyet satırı; büyüklük alt satırda zaten görünüyor.
  const reasons = buyer.reasons.filter((r) => r !== buyer.sizeLabel).slice(0, 3);
  return (
    <Card>
      <View style={{ gap: t.space[3] }}>
        <View style={{ flexDirection: 'row', gap: t.space[3], alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: t.space[1] }}>
            <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>{buyer.name}</Text>
            {subtitle ? <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{subtitle}</Text> : null}
            <View style={{ flexDirection: 'row', gap: t.space[2], flexWrap: 'wrap', paddingTop: t.space[1] }}>
              <Badge kind="info" label={buyer.segmentLabel} />
              {status ? <Badge kind={status.badge} label={tr(status.label)} /> : null}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text accessibilityLabel={tr('Puan {n}', { n: buyer.score })} style={[t.type.title22, { color: t.colors[scoreColor(buyer.score)] }]}>
              {buyer.score}
            </Text>
            <Text style={[t.type.body14, { color: t.colors.ink3 }]}>{tr('puan')}</Text>
          </View>
        </View>
        <View style={{ gap: t.space[1] }}>
          {reasons.map((r) => (
            <View key={r} style={{ flexDirection: 'row', gap: t.space[2] }}>
              <Icon name="checkmark" size={t.size.iconSm} color="ink3" />
              <Text style={[t.type.body14, { color: t.colors.ink2, flex: 1 }]}>{r}</Text>
            </View>
          ))}
        </View>
        {buyer.lead?.note ? <Text style={[t.type.body14, { color: t.colors.ink }]}>{tr('Not: {note}', { note: buyer.lead.note })}</Text> : null}
        <ButtonRow>
          <Button kind="secondary" icon="bookmark-outline" label={status ? tr('Durumu değiştir') : tr('Takibe al')} onPress={onStatus} />
          {buyer.website ? (
            <Button kind="quiet" icon="open-outline" label={tr('Web sitesi')} onPress={() => Linking.openURL(buyer.website!).catch(() => {})} />
          ) : (
            <Button kind="quiet" icon="open-outline" label={tr('Sicil kaydı')} onPress={() => Linking.openURL(buyer.sourceUrl).catch(() => {})} />
          )}
        </ButtonRow>
        <Text style={[t.type.body14, { color: t.colors.ink3 }]} onPress={() => Linking.openURL(buyer.sourceUrl).catch(() => {})} accessibilityRole="link">
          {buyer.sourceLabel}
        </Text>
      </View>
    </Card>
  );
}
