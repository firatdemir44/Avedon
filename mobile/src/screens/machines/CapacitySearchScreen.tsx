import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Switch, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  fetchMachineKinds,
  searchCapacity,
  type CapacityResult,
  type CapacitySearchParams,
  type MachineGroup,
} from '../../api/client';
import { ChipSelect } from '../../components/ChipSelect';
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SectionHeader } from '../../components/SectionHeader';
import { TextField } from '../../components/TextField';
import { EmptyState, InlineError, friendlyMessage } from '../../components/StateView';
import { haptics } from '../../features/haptics';
import {
  MACHINE_GROUP_LABELS,
  MACHINE_GROUP_ORDER,
  machineOneLine,
  monthlyCapacityText,
} from '../../features/machines/catalog';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'CapacitySearch'>;

// Faz 2, Adım 5: "28 fayn 30 pus süprem örecek fason arıyorum" araması.
// Süzgeç formu + sonuç listesi tek ekranda; sonuç satırı firma sayfasını
// Makine parkı sekmesi açık halde açar.

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

const GROUP_OPTIONS: { value: MachineGroup | ''; label: string }[] = [
  { value: '', label: 'Tümü' },
  ...MACHINE_GROUP_ORDER.map((value) => ({ value, label: MACHINE_GROUP_LABELS[value] })),
];

export function CapacitySearchScreen({ navigation }: Props) {
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
      setSearchError('Sayı alanlarına yalnızca rakam girin (ondalık için virgül).');
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
      setSearchError(friendlyMessage(err, 'Arama yapılamadı, tekrar deneyin.'));
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
      setSearchError(friendlyMessage(err, 'Sonraki sonuçlar alınamadı, tekrar deneyin.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const openCompany = (companyId: string) => {
    navigation.navigate('CompanyProfile', { companyId, initialTab: 'machines' });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>
        Aradığınız makineyi tarif edin: fason kapasitesini bildiren firmalar ve eşleşen makineleri listelenir. Fiyat ve
        doluluk takvimi burada yoktur, firmayla konuşmanız gerekir.
      </Text>

      <SectionHeader title="Grup" first />
      <View style={styles.block}>
        <ChipSelect
          options={GROUP_OPTIONS}
          value={group}
          onChange={(next) => {
            haptics.selection();
            setGroup(next);
          }}
          compact
        />
      </View>

      <SectionHeader title="Makine türü" />
      <View style={styles.block}>
        <TextField label="Tür" value={kind} onChangeText={setKind} placeholder="Örn. süprem" maxLength={80} />
        {suggestions.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipStrip}>
            {suggestions.map((item) => (
              <Pressable
                key={item}
                onPress={() => {
                  haptics.selection();
                  setKind(item);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${item}, makine türü olarak yaz`}
                style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
              >
                <Text style={styles.chipText}>{item}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>

      <SectionHeader title="Teknik" />
      <View style={styles.block}>
        <View style={styles.row}>
          <View style={styles.half}>
            <TextField label="Fayn" value={gauge} onChangeText={setGauge} placeholder="Örn. 28" keyboardType="numeric" />
          </View>
          <View style={styles.half}>
            <TextField
              label="Pus (inç)"
              value={diameterInch}
              onChangeText={setDiameterInch}
              placeholder="Örn. 30"
              keyboardType="numeric"
            />
          </View>
        </View>
        <TextField
          label="En az çalışma eni (cm)"
          value={widthMin}
          onChangeText={setWidthMin}
          placeholder="Örn. 180"
          keyboardType="numeric"
        />
      </View>

      <SectionHeader title="Firma" />
      <View style={styles.block}>
        <TextField label="Şehir" value={city} onChangeText={setCity} placeholder="Örn. Bursa" maxLength={60} />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Yalnızca fason açık</Text>
          <Switch
            value={onlyOpen}
            onValueChange={(value) => {
              haptics.selection();
              setOnlyOpen(value);
            }}
            trackColor={{ true: colors.primary, false: colors.border }}
            accessibilityLabel="Yalnızca fason kapasitesi açık firmalar"
          />
        </View>
      </View>

      {searchError ? <InlineError message={searchError} style={styles.banner} /> : null}

      <View style={styles.searchWrap}>
        <PrimaryButton
          label={searching ? 'Aranıyor...' : 'Ara'}
          size="lg"
          icon="search"
          onPress={() => void search()}
          disabled={searching}
        />
      </View>

      {results === null ? null : results.length === 0 ? (
        <View style={styles.block}>
          <EmptyState
            compact
            icon="hardware-chip-outline"
            title="Eşleşen firma yok"
            message="Süzgeci gevşetip tekrar deneyin: türü kısaltmak ya da fayn/pus alanlarını boşaltmak çoğu zaman yeter."
          />
        </View>
      ) : (
        <>
          <SectionHeader title="Sonuçlar" count={results.length} />
          <View style={styles.block}>
            {results.map((result, index) => (
              <Pressable
                key={result.company.id}
                onPress={() => openCompany(result.company.id)}
                accessibilityRole="button"
                accessibilityLabel={`${result.company.name}${result.company.city ? `, ${result.company.city}` : ''}, ${result.matchedCount} eşleşen makine. Firma sayfasını aç`}
                android_ripple={{ color: colors.pressed }}
                style={({ pressed }) => [
                  styles.resultRow,
                  index < results.length - 1 && styles.divider,
                  pressed && styles.pressed,
                ]}
              >
                <CompanyAvatar
                  name={result.company.name}
                  size={40}
                  companyId={result.company.id}
                  logoUpdatedAt={result.company.logoUpdatedAt}
                  verification={result.company.verification}
                />
                <View style={styles.resultTexts}>
                  <Text style={styles.resultName} numberOfLines={1}>
                    {result.company.name}
                  </Text>
                  {result.company.city ? <Text style={styles.resultCity}>{result.company.city}</Text> : null}
                  <Text style={styles.resultCapacity}>
                    {[
                      monthlyCapacityText(result.capacity.monthlyCapacityTons)
                        ? `Aylık ${monthlyCapacityText(result.capacity.monthlyCapacityTons)}`
                        : null,
                      result.capacity.contractOpen ? 'fason açık' : 'fason almıyor',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {result.matchedMachines.map((machine) => (
                    <Text key={machine.id} style={styles.resultMachine} numberOfLines={1}>
                      {machineOneLine(machine)}
                    </Text>
                  ))}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.chevron} />
              </Pressable>
            ))}
          </View>
          {nextOffset !== null ? (
            <View style={styles.moreWrap}>
              <PrimaryButton
                label={loadingMore ? 'Yükleniyor...' : 'Daha fazla göster'}
                variant="outline"
                onPress={() => void loadMore()}
                disabled={loadingMore}
                accessibilityLabel="Daha fazla firma göster"
              />
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  intro: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
  },
  block: { backgroundColor: colors.surface, paddingHorizontal: spacing.gutter, paddingTop: spacing.gutter },
  banner: { marginHorizontal: spacing.gutter, marginTop: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  chipStrip: { gap: spacing.sm, paddingBottom: spacing.md },
  chip: {
    minHeight: MIN_TOUCH - 8,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceTonal,
  },
  chipPressed: { backgroundColor: colors.pressed },
  chipText: { ...typography.label, fontFamily: fonts.medium, color: colors.text },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: MIN_TOUCH,
    paddingBottom: spacing.md,
  },
  switchLabel: { ...typography.label, fontFamily: fonts.semibold, color: colors.text },
  searchWrap: { paddingHorizontal: spacing.gutter, paddingVertical: spacing.md },
  moreWrap: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: -spacing.gutter,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
    minHeight: 64,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  pressed: { backgroundColor: colors.pressed },
  resultTexts: { flex: 1, gap: 2 },
  resultName: { ...typography.label, fontFamily: fonts.semibold, color: colors.accent },
  resultCity: { ...typography.caption, color: colors.textMuted },
  resultCapacity: { ...typography.caption, fontFamily: fonts.mono, color: colors.text },
  resultMachine: { ...typography.caption, color: colors.textMuted },
});
