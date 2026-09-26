// Konfeksiyon araması (docs/konfeksiyon-plani.md Bölüm B, madde 4-6).
//
// Tek kutu + süzgeç sayfası. Serbest metinden sunucu süzgeç çıkarır ("tayt aylık 50 bin
// oeko-tex" → Tayt, kapasite ≥ 50.000/ay, OEKO-TEX); etkin süzgeçler sonuçların üstünde
// silinebilir çip olarak görünür.
// Çip silme: çip süzgeç sayfasından geldiyse o alan temizlenir; metinden geldiyse metin
// DEĞİŞMEZ, alan `off` listesine yazılır ve sunucu o alanı yok sayar. Metin değişince
// `off` sıfırlanır (yeni metin, yeni çözümleme).
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  fetchApparelOptions,
  searchApparel,
  type ApparelFilterField,
  type ApparelKind,
  type ApparelOptions,
  type ApparelResult,
  type ApparelSearchParams,
  type ApparelSearchResponse,
} from '../../api/client';
import { ApparelResultCard } from '../../components/ApparelResultCard';
import { friendlyMessage } from '../../components/StateView';
import { parseNumber } from '../../features/calculators/parse';
import { useTheme } from '../../theme/ThemeContext';
import { tr } from '../../i18n';
import {
  useBottomPadding,
  AppBar,
  BottomSheet,
  Button,
  ButtonRow,
  Chip,
  ChipRow,
  EmptyState,
  Icon,
  Input,
  Screen,
  SearchBox,
  SkeletonRow,
} from '../../ui';

type Props = RootStackScreenProps<'ApparelSearch'>;

const DEBOUNCE_MS = 350;
const PAGE = 20;

// Süzgeç sayfasının açık değerleri (sayılar metin olarak tutulur, gönderirken okunur).
interface SheetFilters {
  kind: ApparelKind;
  group: string;
  capacityMin: string;
  moqMax: string;
  leadMax: string;
  cert: string;
  service: string;
  city: string;
}
const EMPTY_SHEET: SheetFilters = { kind: 'hepsi', group: '', capacityMin: '', moqMax: '', leadMax: '', cert: '', service: '', city: '' };

const kindOptions = (): { key: ApparelKind; label: string }[] => [
  { key: 'koleksiyon', label: tr('Koleksiyon') },
  { key: 'atolye', label: tr('Fason atölye') },
  { key: 'hepsi', label: tr('Hepsi') },
];

// Binlik noktası yazılabilir ("50.000").
const toInt = (s: string) => {
  const n = parseNumber(s.replace(/\./g, ''));
  return n > 0 ? Math.round(n) : undefined;
};

function toParams(q: string, f: SheetFilters, off: ApparelFilterField[]): ApparelSearchParams {
  return {
    q: q.trim() || undefined,
    kind: f.kind === 'hepsi' ? undefined : f.kind,
    group: f.group || undefined,
    capacityMin: toInt(f.capacityMin),
    moqMax: toInt(f.moqMax),
    leadMax: toInt(f.leadMax),
    cert: f.cert || undefined,
    service: f.service || undefined,
    city: f.city.trim() || undefined,
    off,
  };
}

const sheetCount = (f: SheetFilters) =>
  (f.kind !== 'hepsi' ? 1 : 0) + [f.group, f.capacityMin, f.moqMax, f.leadMax, f.cert, f.service, f.city.trim()].filter(Boolean).length;

export function ApparelSearchScreen({ navigation, route }: Props) {
  const t = useTheme();
  const bottomPad = useBottomPadding();
  const [query, setQuery] = useState(route.params?.initialQuery ?? '');
  const [filters, setFilters] = useState<SheetFilters>(EMPTY_SHEET);
  const [off, setOff] = useState<ApparelFilterField[]>([]);
  const [data, setData] = useState<ApparelSearchResponse | null>(null);
  const [items, setItems] = useState<ApparelResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<SheetFilters>(EMPTY_SHEET);
  const [options, setOptions] = useState<ApparelOptions | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    fetchApparelOptions()
      .then(setOptions)
      .catch(() => {
        // Seçenekler gelmezse süzgeç sayfası yalnızca sayı ve il alanlarıyla açılır.
      });
  }, []);

  const run = useCallback((q: string, f: SheetFilters, o: ApparelFilterField[]) => {
    const id = ++requestId.current;
    setLoading(true);
    searchApparel({ ...toParams(q, f, o), limit: PAGE })
      .then((res) => {
        if (requestId.current !== id) return;
        setData(res);
        setItems(res.results);
        setError(null);
      })
      .catch((err) => {
        if (requestId.current !== id) return;
        setError(friendlyMessage(err, tr('Arama yapılamadı')));
      })
      .finally(() => {
        if (requestId.current === id) setLoading(false);
      });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => run(query, filters, off), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, filters, off, run]);

  const changeQuery = (text: string) => {
    setQuery(text);
    setOff([]);
  };

  const loadMore = async () => {
    if (!data?.hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await searchApparel({ ...toParams(query, filters, off), limit: PAGE, offset: items.length });
      setItems((prev) => [...prev, ...res.results]);
      setData(res);
    } catch (err) {
      setError(friendlyMessage(err, tr('Arama yapılamadı')));
    } finally {
      setLoadingMore(false);
    }
  };

  const removeChip = (field: ApparelFilterField, fromText: boolean) => {
    if (fromText) setOff((prev) => (prev.includes(field) ? prev : [...prev, field]));
    setFilters((prev) => ({ ...prev, [field]: field === 'kind' ? 'hepsi' : '' }));
  };

  const openSheet = () => {
    setDraft(filters);
    setSheetOpen(true);
  };
  const applySheet = () => {
    setFilters(draft);
    setSheetOpen(false);
  };

  const count = sheetCount(filters);
  const chips = data?.chips ?? [];

  const choiceChips = (list: { key: string; label: string }[], value: string, set: (v: string) => void) => (
    <ChipRow wrap>
      {list.map((o) => (
        <Chip key={o.key} label={o.label} selected={value === o.key} onPress={() => set(value === o.key ? '' : o.key)} />
      ))}
    </ChipRow>
  );
  const field = (label: string, child: React.ReactNode) => (
    <View style={{ gap: t.space[2] }}>
      <Text style={[t.type.label14, { color: t.colors.ink2 }]}>{label}</Text>
      {child}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar
        title={tr('Konfeksiyon ara')}
        leading="back"
        onBack={() => navigation.goBack()}
        actions={[
          {
            icon: 'filter',
            label: count > 0 ? tr('Süzgeç, {n} seçili', { n: count }) : tr('Süzgeç'),
            dot: count > 0,
            onPress: openSheet,
          },
        ]}
      />
      <Screen scroll={false} noPadding>
        <View style={{ paddingHorizontal: t.space[4], gap: t.space[3], paddingBottom: t.space[3] }}>
          <SearchBox
            value={query}
            onChangeText={changeQuery}
            placeholder={tr('Örn. tayt aylık 50 bin oeko-tex')}
            accessibilityLabel={tr('Konfeksiyon ara')}
            onSubmitEditing={() => run(query, filters, off)}
          />
          {chips.length ? (
            <ChipRow wrap>
              {chips.map((c) => (
                <Chip
                  key={c.field}
                  icon="x"
                  selected
                  label={c.label}
                  onPress={() => removeChip(c.field, c.fromText)}
                />
              ))}
            </ChipRow>
          ) : null}
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: bottomPad, gap: t.space[3] }}
          keyboardShouldPersistTaps="handled"
        >
          {error ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.space[2],
                padding: t.space[3],
                borderRadius: t.radius.md,
                backgroundColor: t.colors.dangerSoft,
              }}
            >
              <Icon name="warning" size={t.size.iconSm} color="danger" />
              <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{error}</Text>
            </View>
          ) : null}
          {loading && !data ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : items.length ? (
            <>
              <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{tr('{n} firma', { n: data?.total ?? items.length })}</Text>
              {items.map((r) => (
                <ApparelResultCard
                  key={r.company.id}
                  result={r}
                  onPress={() => navigation.navigate('CompanyProfile', { companyId: r.company.id, initialTab: 'production' })}
                  onRequestQuote={() =>
                    navigation.navigate('ApparelQuoteForm', {
                      companyId: r.company.id,
                      companyName: r.company.name,
                      productGroup: data?.filters.group ?? r.mainGroups[0]?.key,
                    })
                  }
                />
              ))}
              {data?.hasMore ? <Button kind="secondary" label={tr('Daha fazla')} loading={loadingMore} onPress={loadMore} /> : null}
            </>
          ) : error ? null : (
            <EmptyState
              icon="search"
              title={tr('Uyan firma bulunamadı')}
              description={tr('Süzgeçleri azaltmayı deneyin: çipe dokunarak bir süzgeci kaldırabilirsiniz.')}
              actionLabel={count > 0 ? tr('Süzgeci temizle') : undefined}
              onAction={count > 0 ? () => setFilters(EMPTY_SHEET) : undefined}
            />
          )}
        </ScrollView>
      </Screen>

      <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title={tr('Süzgeç')}>
          <View style={{ gap: t.space[4] }}>
            {field(
              tr('Firma türü'),
              <ChipRow wrap>
                {kindOptions().map((o) => (
                  <Chip key={o.key} label={o.label} selected={draft.kind === o.key} onPress={() => setDraft((d) => ({ ...d, kind: o.key }))} />
                ))}
              </ChipRow>
            )}
            {options ? field(tr('Ürün grubu'), choiceChips(options.productGroups, draft.group, (v) => setDraft((d) => ({ ...d, group: v })))) : null}
            <Input
              label={tr('En az aylık kapasite')}
              unit={tr('adet')}
              keyboardType="number-pad"
              value={draft.capacityMin}
              onChangeText={(v) => setDraft((d) => ({ ...d, capacityMin: v }))}
              maxLength={12}
            />
            <Input
              label={tr('En fazla MOQ (model başı)')}
              unit={tr('adet')}
              helper={tr('Sipariş adediniz: MOQ bu sayıyı aşmayan firmalar')}
              keyboardType="number-pad"
              value={draft.moqMax}
              onChangeText={(v) => setDraft((d) => ({ ...d, moqMax: v }))}
              maxLength={12}
            />
            <Input
              label={tr('En fazla termin')}
              unit={tr('gün')}
              keyboardType="number-pad"
              value={draft.leadMax}
              onChangeText={(v) => setDraft((d) => ({ ...d, leadMax: v }))}
              maxLength={3}
            />
            {options ? field(tr('Sertifika'), choiceChips(options.certificates, draft.cert, (v) => setDraft((d) => ({ ...d, cert: v })))) : null}
            {options ? field(tr('Hizmet'), choiceChips(options.services, draft.service, (v) => setDraft((d) => ({ ...d, service: v })))) : null}
            <Input
              label={tr('İl')}
              placeholder={tr('Örn. Bursa')}
              value={draft.city}
              onChangeText={(v) => setDraft((d) => ({ ...d, city: v }))}
              maxLength={60}
            />
            <ButtonRow>
              <Button kind="secondary" label={tr('Temizle')} disabled={sheetCount(draft) === 0} onPress={() => setDraft(EMPTY_SHEET)} />
              <Button label={tr('Uygula')} onPress={applySheet} />
            </ButtonRow>
          </View>
      </BottomSheet>
    </View>
  );
}
