// Firma rehberi (2026-09-22): üstte arama, altında kategori çipleri
// (İplikçiler, Kumaş üreticileri, Konfeksiyon …), liste. Dernek listelerinden
// içe aktarılan firmalar "LİSTEDE" rozetiyle sahipsiz görünür; dokununca aynı
// firma sayfası açılır (orada "Bu firma benim" başvurusu).
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { refreshControl } from '../../components/refresh';
import type { MainTabScreenProps } from '../../navigation/types';
import { fetchDirectory, type DirectoryCompany, type DirectoryResult } from '../../api/client';
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { friendlyMessage } from '../../components/StateView';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import { tr } from '../../i18n';
import {
  useBottomPadding,
  AppBar,
  Badge,
  Button,
  Chip,
  ChipRow,
  EmptyState,
  ListRow,
  Screen,
  SearchBox,
  SkeletonRow,
} from '../../ui';

// Alt çubuktaki "Firmalar" sekmesi (2026-09-23): geri oku yok.
type Props = MainTabScreenProps<'CompaniesDirectory'>;

const PAGE_SIZE = 30;
const SEARCH_DELAY_MS = 300;

// Çiplerde kısa etiketler; sunucu yeni bir anahtar gönderirse kendi etiketi kullanılır.
const SHORT_LABELS: Record<string, string> = {
  iplik: 'İplikçiler',
  kumas_uretici: 'Kumaş üreticileri',
  konfeksiyon: 'Konfeksiyon',
  fason_atolye: 'Fason atölye',
  boyahane: 'Boyahane',
  aksesuar: 'Aksesuar',
  baski: 'Baskı',
  toptanci: 'Toptancı',
  diger: 'Diğer',
};

const shortLabel = (key: string, fallback: string) => (SHORT_LABELS[key] ? tr(SHORT_LABELS[key]) : fallback);

export function CompaniesDirectoryScreen({ navigation }: Props) {
  const t = useTheme();
  const bottomPad = useBottomPadding();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [companies, setCompanies] = useState<DirectoryCompany[]>([]);
  const [categories, setCategories] = useState<DirectoryResult['categories']>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Eski isteğin yanıtı yenisini ezmesin.
  const seq = useRef(0);

  // Yazdıkça 300 ms bekleyip arar.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const load = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDirectory({ category, q: query, limit: PAGE_SIZE });
      if (id !== seq.current) return;
      setCompanies(res.companies);
      setTotal(res.total);
      setNextOffset(res.nextOffset);
      if (res.categories?.length) setCategories(res.categories);
    } catch (err) {
      if (id !== seq.current) return;
      setError(friendlyMessage(err, tr('Firmalar alınamadı')));
      setCompanies([]);
      setNextOffset(null);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [category, query]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    if (nextOffset === null || loadingMore) return;
    const id = seq.current;
    setLoadingMore(true);
    try {
      const res = await fetchDirectory({ category, q: query, offset: nextOffset, limit: PAGE_SIZE });
      if (id !== seq.current) return;
      setCompanies((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...res.companies.filter((c) => !seen.has(c.id))];
      });
      setNextOffset(res.nextOffset);
    } catch (err) {
      if (id === seq.current) setError(friendlyMessage(err, tr('Devamı alınamadı')));
    } finally {
      setLoadingMore(false);
    }
  };

  const filtered = !!query || category !== null;

  const header = (
    <View style={{ gap: t.space[3], paddingTop: t.space[4], paddingBottom: t.space[2] }}>
      <SearchBox
        placeholder={tr('Firma adı ara')}
        value={text}
        onChangeText={setText}
        accessibilityLabel={tr('Firma ara')}
        testID="directory-search"
      />
      <ChipRow>
        <Chip
          label={tr('Tümü')}
          selected={category === null}
          onPress={() => {
            haptics.selection();
            setCategory(null);
          }}
        />
        {categories.map((c) => (
          <Chip
            key={c.key}
            label={`${shortLabel(c.key, c.label)} (${c.count})`}
            selected={category === c.key}
            onPress={() => {
              haptics.selection();
              setCategory(category === c.key ? null : c.key);
            }}
          />
        ))}
      </ChipRow>
      {!loading && companies.length > 0 ? (
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{tr('{n} firma', { n: total })}</Text>
      ) : null}
    </View>
  );

  const empty = loading ? (
    <View>
      {Array.from({ length: 6 }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </View>
  ) : error ? (
    <EmptyState icon="warning" title={tr('Firmalar alınamadı')} description={error} actionLabel={tr('Tekrar dene')} onAction={load} />
  ) : (
    <EmptyState
      icon="business-outline"
      title={tr('Firma bulunamadı')}
      description={filtered ? tr('Başka bir ad ya da kategori deneyin.') : tr('Rehberde henüz firma yok.')}
      actionLabel={filtered ? tr('Süzgeci temizle') : undefined}
      onAction={
        filtered
          ? () => {
              setText('');
              setQuery('');
              setCategory(null);
            }
          : undefined
      }
    />
  );

  const footer =
    !loading && companies.length > 0 ? (
      <View style={{ paddingTop: t.space[4], gap: t.space[2] }}>
        {error ? <Text style={[t.type.body14, { color: t.colors.danger }]}>{error}</Text> : null}
        {nextOffset !== null ? (
          <Button kind="secondary" label={tr('Daha fazla')} loading={loadingMore} onPress={loadMore} fullWidth />
        ) : null}
      </View>
    ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title={tr('Firmalar')} />
      <Screen scroll={false} contentStyle={{ flex: 1, gap: 0 }}>
        <FlatList
          data={loading ? [] : companies}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl(loading && companies.length > 0, load, t)}
          contentContainerStyle={{ paddingBottom: bottomPad }}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          ListFooterComponent={footer}
          renderItem={({ item, index }) => {
            const subtitle = [shortLabel(item.category, item.categoryLabel), item.city].filter(Boolean).join(' · ');
            return (
              <ListRow
                title={item.name}
                subtitle={subtitle || undefined}
                left={
                  <CompanyAvatar
                    name={item.name}
                    companyId={item.id}
                    logoUpdatedAt={item.logoUpdatedAt}
                    size={t.size.avatar}
                  />
                }
                right={
                  !item.claimed ? (
                    <Badge kind="info" label={tr('LİSTEDE')} />
                  ) : item.verification === 'dogrulanmis' ? (
                    <Badge kind="verified" />
                  ) : undefined
                }
                divider={index < companies.length - 1}
                onPress={() => navigation.navigate('CompanyProfile', { companyId: item.id, claimed: item.claimed })}
                testID={`directory-row-${item.id}`}
              />
            );
          }}
        />
      </Screen>
    </View>
  );
}
