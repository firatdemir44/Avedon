// Fason kapasite araması (yeni tasarım, 4. adım — DESIGN.md §2/§3).
//
// Faz 2, Adım 5'teki mantık aynen duruyor: "28 fayn 30 pus süprem örecek fason
// arıyorum". Süzgeç + sonuç listesi tek ekranda; sonuç satırı firma sayfasını
// Makine parkı sekmesi açık halde açar. Sayfalama sunucunun hasMore/nextOffset
// alanlarıyla (Faz 2, Adım 7).
//
// Görünüm yeni: AppBar + Screen, arama ui/SearchBox, süzgeçler ui/Chip,
// sayısal alanlar ui/Input (birimli), sonuçlar ui/ListRow, tek dolu "Ara"
// düğmesi yapışkan çubukta.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Switch } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  fetchMachineKinds,
  searchCapacity,
  type CapacityResult,
  type CapacitySearchParams,
  type MachineGroup,
} from '../../api/client';
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { friendlyMessage } from '../../components/StateView';
import { haptics } from '../../features/haptics';
import {
  MACHINE_GROUP_LABELS,
  MACHINE_GROUP_ORDER,
  machineOneLine,
  monthlyCapacityText,
} from '../../features/machines/catalog';
import { useTheme } from '../../theme/ThemeContext';
import { tr } from '../../i18n';
import {
  AppBar,
  Badge,
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  Icon,
  Input,
  ListRow,
  Screen,
  SearchBox,
  SectionTitle,
} from '../../ui';

type Props = RootStackScreenProps<'CapacitySearch'>;

const NUMBER_PATTERN = /^\d+([.,]\d+)?$/;

function readNumber(text: string): { value?: number; invalid: boolean } {
  const trimmed = text.trim();
  if (!trimmed) return { invalid: false };
  if (!NUMBER_PATTERN.test(trimmed)) return { invalid: true };
  return { value: Number(trimmed.replace(',', '.')), invalid: false };
}

function fold(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .trim();
}

// Etiketler çeviri için çizim anında üretilir (modül düzeyinde tr() çağrılmaz).
const groupOptions = (): { value: MachineGroup | ''; label: string }[] => [
  { value: '', label: tr('Tümü') },
  ...MACHINE_GROUP_ORDER.map((value) => ({ value, label: tr(MACHINE_GROUP_LABELS[value]) })),
];

export function CapacitySearchScreen({ navigation }: Props) {
  const t = useTheme();
  const [group, setGroup] = useState<MachineGroup | ''>('');
  const [kind, setKind] = useState('');
  const [gauge, setGauge] = useState('');
  const [diameterInch, setDiameterInch] = useState('');
  const [widthMin, setWidthMin] = useState('');
  const [city, setCity] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(false);

  const [kindOptions, setKindOptions] = useState<Record<string, string[]>>({});
  const [results, setResults] = useState<CapacityResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Sayfalama (Faz 2, Adım 7): sunucu hasMore + nextOffset döndürüyor.
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const lastParams = useRef<CapacitySearchParams>({});

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    let cancelled = false;
    fetchMachineKinds()
      .then(({ kinds }) => {
        if (!cancelled) setKindOptions(kinds);
      })
      // Öneri gelmezse arama yine çalışır: tür serbest metin.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const suggestions = useMemo(() => {
    const all = group ? kindOptions[group] ?? [] : MACHINE_GROUP_ORDER.flatMap((g) => kindOptions[g] ?? []);
    const typed = fold(kind);
    const filtered = typed ? all.filter((option) => fold(option).includes(typed)) : all;
    return filtered.slice(0, 12);
  }, [group, kind, kindOptions]);

  const gaugeValue = readNumber(gauge);
  const diameterValue = readNumber(diameterInch);
  const widthValue = readNumber(widthMin);
  const numbersInvalid = [gaugeValue, diameterValue, widthValue].some((n) => n.invalid);

  const search = async () => {
    if (numbersInvalid) {
      haptics.error();
      setSearchError(tr('Sayı alanlarına yalnızca rakam girin (ondalık için virgül).'));
      return;
    }
    // Yeni arama: liste ve sayfalama sıfırlanır.
    const params: CapacitySearchParams = {
      group: group || undefined,
      kind,
      gauge: gaugeValue.value,
      diameterInch: diameterValue.value,
      widthMin: widthValue.value,
      contractOpen: onlyOpen,
      city,
    };
    lastParams.current = params;
    setSearching(true);
    setSearchError(null);
    setNextOffset(null);
    try {
      const page = await searchCapacity(params);
      setResults(page.results);
      setNextOffset(page.hasMore ? page.nextOffset : null);
    } catch (err) {
      haptics.error();
      setSearchError(friendlyMessage(err, tr('Arama yapılamadı, tekrar deneyin.')));
    } finally {
      setSearching(false);
    }
  };

  // "Daha fazla göster": süzgeç formunda sonradan yapılan değişiklikler değil,
  // aramanın kendi süzgeci kullanılır (liste karışmasın).
  const loadMore = async () => {
    if (nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    setSearchError(null);
    try {
      const page = await searchCapacity({ ...lastParams.current, offset: nextOffset });
      setResults((prev) => {
        const current = prev ?? [];
        const seen = new Set(current.map((r) => r.company.id));
        // Aynı firma iki sayfada birden gelirse ikinci kez eklenmez.
        return [...current, ...page.results.filter((r) => !seen.has(r.company.id))];
      });
      setNextOffset(page.hasMore ? page.nextOffset : null);
    } catch (err) {
      haptics.error();
      setSearchError(friendlyMessage(err, tr('Sonraki sonuçlar alınamadı, tekrar deneyin.')));
    } finally {
      setLoadingMore(false);
    }
  };

  const openCompany = (companyId: string) => {
    navigation.navigate('CompanyProfile', { companyId, initialTab: 'machines' });
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title={tr('Fason kapasite ara')} leading="back" onBack={() => navigation.goBack()} />

      <Screen
        sticky={
          <Button
            size="lg"
            label={tr('Ara')}
            icon="search"
            loading={searching}
            disabled={searching}
            onPress={() => void search()}
          />
        }
      >
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
          {tr('Aradığın makineyi tarif et: fason kapasitesini bildiren firmalar ve eşleşen makineleri listelenir. Fiyat ve doluluk takvimi burada yoktur, firmayla konuşman gerekir.')}
        </Text>

        <SearchBox
          placeholder={tr('Makine türü — örn. süprem')}
          value={kind}
          onChangeText={setKind}
          onSubmitEditing={() => void search()}
          accessibilityLabel={tr('Makine türü ara')}
        />

        <View style={{ gap: t.space[2] }}>
          <SectionTitle title={tr('Grup')} />
          <ChipRow>
            {groupOptions().map((option) => (
              <Chip
                key={option.value || 'all'}
                label={option.label}
                selected={option.value === group}
                onPress={() => {
                  haptics.selection();
                  setGroup(option.value);
                }}
              />
            ))}
          </ChipRow>
        </View>

        {suggestions.length ? (
          <View style={{ gap: t.space[2] }}>
            <SectionTitle title={tr('Öneriler')} />
            <ChipRow>
              {suggestions.map((item) => (
                <Chip
                  key={item}
                  label={item}
                  selected={item === kind}
                  onPress={() => {
                    haptics.selection();
                    setKind(item);
                  }}
                />
              ))}
            </ChipRow>
          </View>
        ) : null}

        <View style={{ gap: t.space[2] }}>
          <SectionTitle title={tr('Teknik')} />
          <Card>
            <View style={{ gap: t.space[3] }}>
              <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                <Input
                  containerStyle={{ flex: 1 }}
                  label={tr('Fayn')}
                  value={gauge}
                  onChangeText={setGauge}
                  placeholder={tr('Örn. 28')}
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                  error={gaugeValue.invalid ? tr('Yalnızca rakam') : null}
                />
                <Input
                  containerStyle={{ flex: 1 }}
                  label={tr('Pus')}
                  unit={tr('inç')}
                  value={diameterInch}
                  onChangeText={setDiameterInch}
                  placeholder={tr('Örn. 30')}
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                  error={diameterValue.invalid ? tr('Yalnızca rakam') : null}
                />
              </View>
              <Input
                label={tr('En az çalışma eni')}
                unit="cm"
                value={widthMin}
                onChangeText={setWidthMin}
                placeholder={tr('Örn. 180')}
                inputMode="decimal"
                keyboardType="decimal-pad"
                error={widthValue.invalid ? tr('Yalnızca rakam') : null}
              />
            </View>
          </Card>
        </View>

        <View style={{ gap: t.space[2] }}>
          <SectionTitle title={tr('Firma')} />
          <Card>
            <View style={{ gap: t.space[3] }}>
              <Input label={tr('Şehir')} value={city} onChangeText={setCity} placeholder={tr('Örn. Bursa')} maxLength={60} />
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: t.space[3],
                  minHeight: t.size.touchMin,
                }}
              >
                <Text style={[t.type.body16, { color: t.colors.ink, flex: 1, minWidth: 0 }]}>
                  {tr('Yalnızca fason açık firmalar')}
                </Text>
                <Switch
                  value={onlyOpen}
                  onValueChange={(value) => {
                    haptics.selection();
                    setOnlyOpen(value);
                  }}
                  trackColor={{ true: t.colors.brand, false: t.colors.lineStrong }}
                  accessibilityLabel={tr('Yalnızca fason kapasitesi açık firmalar')}
                />
              </View>
            </View>
          </Card>
        </View>

        {searchError ? (
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
            <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{searchError}</Text>
          </View>
        ) : null}

        {results === null ? null : results.length === 0 ? (
          <EmptyState
            icon="machine"
            title={tr('Eşleşen firma yok')}
            description={tr('Süzgeci gevşetip tekrar dene: türü kısaltmak ya da fayn/pus alanlarını boşaltmak çoğu zaman yeter.')}
          />
        ) : (
          <View style={{ gap: t.space[2] }}>
            <SectionTitle title={tr('Sonuçlar ({n})', { n: results.length })} />
            <Card noPadding style={{ paddingHorizontal: t.space[4] }}>
              {results.map((result, index) => {
                const capacity = [
                  monthlyCapacityText(result.capacity.monthlyCapacityTons)
                    ? tr('Aylık {cap}', { cap: monthlyCapacityText(result.capacity.monthlyCapacityTons) as string })
                    : null,
                  result.capacity.contractOpen ? tr('fason açık') : tr('fason almıyor'),
                  result.company.city || null,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <View key={result.company.id}>
                    <ListRow
                      title={result.company.name}
                      subtitle={capacity}
                      left={
                        <CompanyAvatar
                          name={result.company.name}
                          size={t.size.avatar}
                          companyId={result.company.id}
                          logoUpdatedAt={result.company.logoUpdatedAt}
                          verification={result.company.verification}
                        />
                      }
                      right={
                        result.company.verification === 'dogrulanmis' ? <Badge kind="verified" /> : undefined
                      }
                      divider={false}
                      onPress={() => openCompany(result.company.id)}
                    />
                    {/* Eşleşen makineler satırın ALTINDA: tek satırlık alt metne sığmaz. */}
                    <View
                      style={{
                        gap: t.space[1],
                        paddingBottom: t.space[3],
                        borderBottomWidth: index < results.length - 1 ? 1 : 0,
                        borderBottomColor: t.colors.line,
                      }}
                    >
                      {result.matchedMachines.map((machine) => (
                        <Text key={machine.id} numberOfLines={1} style={[t.type.mono14, { color: t.colors.ink2 }]}>
                          {machineOneLine(machine)}
                        </Text>
                      ))}
                    </View>
                  </View>
                );
              })}
            </Card>
            {nextOffset !== null ? (
              <Button
                kind="secondary"
                fullWidth
                label={tr('Daha fazla göster')}
                accessibilityLabel={tr('Daha fazla firma göster')}
                loading={loadingMore}
                disabled={loadingMore}
                onPress={() => void loadMore()}
              />
            ) : null}
          </View>
        )}
      </Screen>
    </View>
  );
}
