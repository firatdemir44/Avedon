import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RootStackScreenProps } from '../../navigation/types';
import { globalSearch, type GlobalSearchCompany, type GlobalSearchResult } from '../../api/client';
import { SearchField } from '../../components/SearchField';
import { SectionHeader } from '../../components/SectionHeader';
import { ProductRow } from '../../components/ProductRow';
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { EmptyState, InlineError, friendlyMessage } from '../../components/StateView';
import { companyTypeLabel } from '../../features/products/catalog';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'GlobalSearch'>;

// Üst başlıktaki "Arama Yap" kutusunun açtığı ekran (Fırat 2026-09-21).
// Tek kutudan firma, kumaş ve iplik: GET /api/search (en az 2 karakter,
// oturumsuz da çalışır). Her grup en çok 5 sonuç; `hasMore` varsa grubun
// altında "Tümünü gör" ilgili listeyi aynı arama metniyle açar.
const DEBOUNCE_MS = 350;
const MIN_QUERY = 2;
const RECENT_KEY = 'avedon.recentSearches';
const MAX_RECENT = 5;

export function GlobalSearchScreen({ navigation }: Props) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<GlobalSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  // Eski yanıt yeni sonucu ezmesin: yalnızca en son isteğin yanıtı yazılır.
  const requestIdRef = useRef(0);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setRecent(parsed.filter((v): v is string => typeof v === 'string').slice(0, MAX_RECENT));
      })
      .catch(() => {});
  }, []);

  const run = useCallback((q: string) => {
    const trimmed = q.trim();
    const id = ++requestIdRef.current;
    if (trimmed.length < MIN_QUERY) {
      setResult(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    globalSearch(trimmed)
      .then((data) => {
        if (requestIdRef.current !== id) return;
        setResult(data);
        setError(null);
      })
      .catch((err) => {
        if (requestIdRef.current !== id) return;
        setResult(null);
        setError(friendlyMessage(err, 'Arama yapılamadı'));
      })
      .finally(() => {
        if (requestIdRef.current !== id) return;
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => run(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, run]);

  const rememberQuery = (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < MIN_QUERY) return;
    setRecent((prev) => {
      const next = [trimmed, ...prev.filter((item) => item !== trimmed)].slice(0, MAX_RECENT);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const clearRecent = () => {
    setRecent([]);
    AsyncStorage.removeItem(RECENT_KEY).catch(() => {});
  };

  // Bir sonuca gidilince arama metni son aramalara eklenir.
  const go = (navigate: () => void) => {
    rememberQuery(query);
    navigate();
  };

  const trimmed = query.trim();
  const hasResults =
    !!result && (result.companies.items.length > 0 || result.fabrics.items.length > 0 || result.yarns.items.length > 0);

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Firma, kumaş ya da iplik ara"
          accessibilityLabel="Firma, kumaş ya da iplik ara"
          autoFocus
          onSubmitEditing={() => run(query)}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? <InlineError message={error} onRetry={() => run(query)} style={styles.banner} /> : null}

        {trimmed.length < MIN_QUERY ? (
          <View style={styles.block}>
            <Text style={styles.hint}>
              Firma adı, kumaş kodu, çeşit ya da iplik yazın. Örn. süprem, 30/1, Bursa
            </Text>
            {recent.length ? (
              <View style={styles.recentWrap}>
                <View style={styles.recentHead}>
                  <Text style={styles.recentTitle}>Son aramalar</Text>
                  <Pressable
                    onPress={clearRecent}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Son aramaları temizle"
                  >
                    <Text style={styles.clearText}>Temizle</Text>
                  </Pressable>
                </View>
                <View style={styles.chips}>
                  {recent.map((item) => (
                    <Pressable
                      key={item}
                      onPress={() => setQuery(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`${item} aramasını tekrarla`}
                      style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                    >
                      <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                      <Text style={styles.chipText} numberOfLines={1}>
                        {item}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : loading && !result ? (
          <ActivityIndicator style={styles.spinner} color={colors.primary} />
        ) : hasResults && result ? (
          <>
            {result.companies.items.length ? (
              <View>
                <SectionHeader title="Firmalar" first />
                <View style={styles.block}>
                  {result.companies.items.map((company, index) => (
                    <CompanyResultRow
                      key={company.id}
                      company={company}
                      divider={index < result.companies.items.length - 1}
                      onPress={() => go(() => navigation.navigate('CompanyProfile', { companyId: company.id }))}
                    />
                  ))}
                </View>
                {/* Firmada "Tümünü gör" yok: firma listesi ekranı henüz yok. */}
              </View>
            ) : null}

            {result.fabrics.items.length ? (
              <View>
                <SectionHeader title="Kumaşlar" />
                <View style={styles.block}>
                  {result.fabrics.items.map((product, index) => (
                    <ProductRow
                      key={product.id}
                      product={product}
                      divider={index < result.fabrics.items.length - 1}
                      onPress={() => go(() => navigation.navigate('ProductDetail', { productId: product.id }))}
                    />
                  ))}
                </View>
                {result.fabrics.hasMore ? (
                  <SeeAll
                    label="Tüm kumaş sonuçlarını gör"
                    onPress={() =>
                      go(() =>
                        navigation.navigate('MainTabs', {
                          screen: 'ProductList',
                          params: { initialSearch: trimmed, searchKey: Date.now() },
                        })
                      )
                    }
                  />
                ) : null}
              </View>
            ) : null}

            {result.yarns.items.length ? (
              <View>
                <SectionHeader title="İplikler" />
                <View style={styles.block}>
                  {result.yarns.items.map((product, index) => (
                    <ProductRow
                      key={product.id}
                      product={product}
                      divider={index < result.yarns.items.length - 1}
                      onPress={() => go(() => navigation.navigate('ProductDetail', { productId: product.id }))}
                    />
                  ))}
                </View>
                {result.yarns.hasMore ? (
                  <SeeAll
                    label="Tüm iplik sonuçlarını gör"
                    onPress={() =>
                      go(() =>
                        navigation.navigate('YarnDirectory', {
                          preset: { search: trimmed },
                          presetKey: Date.now(),
                        })
                      )
                    }
                  />
                ) : null}
              </View>
            ) : null}
          </>
        ) : error ? null : (
          <EmptyState
            icon="search-outline"
            title="Sonuç bulunamadı"
            message={`“${trimmed}” için sonuç bulunamadı.`}
            actionLabel="Fotoğrafla kumaş ara"
            onAction={() => navigation.navigate('SimilarSearch')}
          />
        )}
      </ScrollView>
    </View>
  );
}

function SeeAll({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.seeAll, pressed && styles.seeAllPressed]}
    >
      <Text style={styles.seeAllText}>Tümünü gör</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.accent} />
    </Pressable>
  );
}

function CompanyResultRow({
  company,
  divider,
  onPress,
}: {
  company: GlobalSearchCompany;
  divider: boolean;
  onPress: () => void;
}) {
  const meta = [company.city, companyTypeLabel(company.companyType), `${company.productCount} ürün`]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={company.name}
      style={({ pressed }) => [styles.companyRow, divider && styles.rowDivider, pressed && styles.rowPressed]}
    >
      <CompanyAvatar
        name={company.name}
        verification={company.verification}
        companyId={company.id}
        logoUpdatedAt={company.logoUpdatedAt}
        size={40}
      />
      <View style={styles.companyTexts}>
        <Text style={styles.companyName} numberOfLines={1}>
          {company.name}
        </Text>
        {meta ? (
          <Text style={styles.companyMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.chevron} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchBar: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.gutter,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  content: { paddingBottom: spacing.xl },
  banner: { marginHorizontal: spacing.gutter, marginTop: spacing.md },
  block: { backgroundColor: colors.surface },
  spinner: { marginTop: spacing.xl },
  hint: {
    ...typography.body,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.md,
  },
  recentWrap: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.md },
  recentHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  recentTitle: { ...typography.label, fontFamily: fonts.semibold, color: colors.textMuted },
  clearText: { ...typography.label, color: colors.danger },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTonal,
    maxWidth: '100%',
  },
  chipPressed: { backgroundColor: colors.pressed },
  chipText: { ...typography.label, color: colors.text, flexShrink: 1 },
  companyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 60,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowPressed: { backgroundColor: colors.pressed },
  companyTexts: { flex: 1, gap: 2 },
  companyName: { ...typography.bodyStrong, color: colors.accent },
  companyMeta: { ...typography.caption, color: colors.textMuted },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.gutter,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  seeAllPressed: { backgroundColor: colors.pressed },
  seeAllText: { ...typography.label, fontFamily: fonts.semibold, color: colors.accent },
});
