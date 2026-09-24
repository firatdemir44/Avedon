// Sektör gündemi: tüm başlıklar; konu ve dil süzgeci, aşağı çekip yenileme, sayfalama.
// "Akışta paylaş" → gönderi ekranı bağlantıyla açılır, önizleme kartı orada hazırlanır.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { fetchNews, type NewsItem, type NewsTopicKey } from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { useTheme } from '../../theme/ThemeContext';
import { Chip, ChipRow, EmptyState, SkeletonRow, useBottomPadding } from '../../ui';
import { NewsRow } from './NewsRow';

type Props = RootStackScreenProps<'SectorNews'>;
type Lang = 'tr' | 'en' | 'all';

const TOPIC_CHIPS: { key: NewsTopicKey | null; label: string }[] = [
  { key: null, label: 'Tümü' },
  { key: 'hammadde', label: 'Hammadde' },
  { key: 'fiyat', label: 'Fiyat' },
  { key: 'ihracat', label: 'İhracat' },
  { key: 'fuar', label: 'Fuar' },
  { key: 'moda', label: 'Moda' },
  { key: 'makine', label: 'Makine' },
  { key: 'surdurulebilirlik', label: 'Sürdürülebilirlik' },
];
const LANG_CHIPS: { key: Lang; label: string }[] = [
  { key: 'all', label: 'Hepsi' },
  { key: 'tr', label: 'Türkçe' },
  { key: 'en', label: 'İngilizce' },
];

export function SectorNewsScreen({ navigation }: Props) {
  const t = useTheme();
  const bottomPad = useBottomPadding();
  const [topic, setTopic] = useState<NewsTopicKey | null>(null);
  const [lang, setLang] = useState<Lang>('all');
  const [items, setItems] = useState<NewsItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Süzgeç hızla değişince eski cevap yenisinin üstüne yazmasın.
  const reqRef = useRef(0);

  const load = useCallback(
    async (nextPage: number, mode: 'first' | 'refresh' | 'more') => {
      const req = ++reqRef.current;
      if (mode === 'first') setLoading(true);
      if (mode === 'more') setLoadingMore(true);
      try {
        const r = await fetchNews({ topic: topic ?? undefined, lang: lang === 'all' ? undefined : lang, page: nextPage });
        if (req !== reqRef.current) return;
        setItems((prev) => (nextPage === 1 ? r.items : [...prev, ...r.items.filter((i) => !prev.some((p) => p.id === i.id))]));
        setPage(r.page);
        setHasMore(r.hasMore);
        setError(null);
      } catch (err) {
        if (req === reqRef.current) setError(friendlyMessage(err, 'Haberler alınamadı'));
      } finally {
        if (req === reqRef.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [topic, lang]
  );

  useEffect(() => {
    load(1, 'first');
  }, [load]);

  const share = (item: NewsItem) => navigation.navigate('CreatePost', { initialLink: item.url });

  const header = (
    <View style={{ gap: t.space[2], paddingVertical: t.space[3] }}>
      <ChipRow>
        {TOPIC_CHIPS.map((c) => (
          <Chip key={c.label} label={c.label} selected={topic === c.key} onPress={() => setTopic(c.key)} />
        ))}
      </ChipRow>
      <ChipRow>
        {LANG_CHIPS.map((c) => (
          <Chip key={c.key} label={c.label} selected={lang === c.key} onPress={() => setLang(c.key)} />
        ))}
      </ChipRow>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <FlatList
        data={loading ? [] : items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: bottomPad }}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: t.colors.line, marginVertical: t.space[3] }} />}
        renderItem={({ item }) => <NewsRow item={item} showSummary onShare={share} />}
        refreshControl={refreshControl(refreshing, () => {
          setRefreshing(true);
          load(1, 'refresh');
        })}
        onEndReached={() => {
          if (hasMore && !loadingMore && !loading) load(page + 1, 'more');
        }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          loading ? (
            <View style={{ gap: t.space[4] }}>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </View>
          ) : error ? (
            <EmptyState icon="warning" title="Haberler alınamadı" description={error} actionLabel="Tekrar dene" onAction={() => load(1, 'first')} />
          ) : (
            <EmptyState
              icon="newspaper-outline"
              title="Bu süzgeçte haber yok"
              description="Başka bir konu ya da dil seçebilirsiniz. Haberler birkaç saatte bir yenilenir."
              actionLabel={topic || lang !== 'all' ? 'Süzgeci temizle' : undefined}
              onAction={topic || lang !== 'all' ? () => { setTopic(null); setLang('all'); } : undefined}
            />
          )
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: t.space[4] }} color={t.colors.brand} /> : null}
      />
    </View>
  );
}
