import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, StyleSheet } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  deleteCompanyMemory,
  fetchCompanyMemory,
  setCompanyMemory,
  type MemoryEntry,
  type MemoryKeyDef,
} from '../../api/client';
import { ListRow } from '../../components/ListRow';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SectionHeader } from '../../components/SectionHeader';
import { EmptyState, ErrorState, InlineError } from '../../components/StateView';
import { SkeletonList } from '../../components/Skeleton';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { useFocusLoad } from '../../features/useFocusLoad';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'AssistantMemory'>;

// Firma hafızası: asistanın hesaplarda varsayılan olarak ÖNERDİĞİ değerler
// (kur, fason ücreti, fire, kâr oranı...). Asistan buraya kendisi yazmaz;
// yazma ya sohbetteki öneri kartından ya da bu ekrandan olur.

function displayValue(value: number | string | undefined): string {
  if (value === undefined || value === null || value === '') return '';
  return typeof value === 'number' ? value.toLocaleString('tr-TR') : String(value);
}

// "12,5" ve "12.5" kabul edilir; binlik ayırıcı beklenmez.
function parseNumber(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

// Ekran yalnızca sunucudan okur/yazar; navigation'a ihtiyacı yok.
export function AssistantMemoryScreen(_props: Props) {
  const { data, status, error, reload } = useFocusLoad(fetchCompanyMemory);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [rowError, setRowError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const entryByKey = useMemo(() => {
    const map = new Map<string, MemoryEntry>();
    for (const entry of data?.memory ?? []) map.set(entry.key, entry);
    return map;
  }, [data]);

  const startEdit = useCallback(
    (def: MemoryKeyDef) => {
      setRowError(null);
      setEditingKey(def.key);
      setDraft(displayValue(entryByKey.get(def.key)?.value));
    },
    [entryByKey]
  );

  const save = useCallback(
    async (def: MemoryKeyDef) => {
      setRowError(null);
      let value: number | string;
      if (def.kind === 'number') {
        const parsed = parseNumber(draft);
        if (parsed === null) {
          setRowError('Bu alana sayı girilir.');
          return;
        }
        value = parsed;
      } else {
        const text = draft.trim();
        if (!text) {
          setRowError('Boş bırakılamaz; silmek için "Sil" düğmesini kullanın.');
          return;
        }
        value = text;
      }
      setSaving(true);
      try {
        await setCompanyMemory(def.key, value);
        haptics.success();
        setEditingKey(null);
        setDraft('');
        await reload();
      } catch (err) {
        haptics.error();
        setRowError(err instanceof ApiError ? err.message : 'Kaydedilemedi, tekrar deneyin.');
      } finally {
        setSaving(false);
      }
    },
    [draft, reload]
  );

  const remove = useCallback(
    async (def: MemoryKeyDef) => {
      const ok = await confirmAction({
        title: 'Değer silinsin mi?',
        message: `${def.label} hafızadan kaldırılacak.`,
        confirmLabel: 'Sil',
        destructive: true,
      });
      if (!ok) return;
      setSaving(true);
      try {
        await deleteCompanyMemory(def.key);
        haptics.success();
        setEditingKey(null);
        await reload();
      } catch {
        haptics.error();
        setRowError('Silinemedi, tekrar deneyin.');
      } finally {
        setSaving(false);
      }
    },
    [reload]
  );

  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        <SkeletonList variant="row" />
      </View>
    );
  }

  // Firması olmayan kullanıcıda sunucu 403 no_company döner.
  if (status === 'error' && error instanceof ApiError && error.status === 403) {
    return (
      <View style={styles.screen}>
        <EmptyState
          icon="business-outline"
          title="Firma hafızası firmaya bağlı"
          message="Bu değerler firmanızın varsayılanlarıdır (kur, fason ücreti, fire, kâr oranı). Bir firmaya bağlandığınızda burada düzenleyebilirsiniz."
        />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.screen}>
        <ErrorState error={error} fallback="Firma hafızası alınamadı" onRetry={reload} />
      </View>
    );
  }

  const keys = data?.keys ?? [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>
        Asistan hesap yaparken bu değerleri varsayılan olarak önerir ve hangisini kullandığını söyler. Boş bırakılan
        değerleri her seferinde size sorar.
      </Text>
      <SectionHeader title="Kayıtlı değerler" first />
      <View style={styles.block}>
        {keys.map((def, index) => {
          const entry = entryByKey.get(def.key);
          const isEditing = editingKey === def.key;

          if (isEditing) {
            return (
              <View key={def.key} style={[styles.editBlock, index < keys.length - 1 && styles.divider]}>
                <Text style={styles.editLabel}>{def.label}</Text>
                <Text style={styles.editHint}>{def.hint}</Text>
                <TextInput
                  style={styles.input}
                  value={draft}
                  onChangeText={setDraft}
                  autoFocus
                  keyboardType={def.kind === 'number' ? 'decimal-pad' : 'default'}
                  multiline={def.kind === 'list'}
                  placeholder={def.hint}
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel={def.label}
                />
                {rowError ? <InlineError message={rowError} style={styles.rowError} /> : null}
                <View style={styles.actions}>
                  <PrimaryButton
                    label={saving ? 'Kaydediliyor' : 'Kaydet'}
                    onPress={() => void save(def)}
                    disabled={saving}
                    style={styles.action}
                  />
                  <PrimaryButton
                    label="Vazgeç"
                    variant="outline"
                    onPress={() => {
                      setEditingKey(null);
                      setRowError(null);
                    }}
                    disabled={saving}
                    style={styles.action}
                  />
                </View>
                {entry ? (
                  <PrimaryButton
                    label="Sil"
                    variant="outline"
                    icon="trash-outline"
                    onPress={() => void remove(def)}
                    disabled={saving}
                    style={styles.removeAction}
                  />
                ) : null}
              </View>
            );
          }

          return (
            <ListRow
              key={def.key}
              title={def.label}
              subtitle={def.hint}
              minHeight={60}
              divider={index < keys.length - 1}
              right={
                <Text style={entry ? styles.value : styles.valueEmpty}>
                  {entry ? displayValue(entry.value) : 'Kayıtlı değil'}
                </Text>
              }
              accessibilityLabel={`${def.label}, ${entry ? displayValue(entry.value) : 'kayıtlı değil'}. Düzenle`}
              onPress={() => startEdit(def)}
            />
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  intro: {
    ...typography.label,
    fontFamily: fonts.regular,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
    paddingTop: 12,
  },
  block: { backgroundColor: colors.surface },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  value: { ...typography.mono, color: colors.primary, maxWidth: 160, textAlign: 'right' },
  valueEmpty: { ...typography.caption, color: colors.textMuted },
  editBlock: { paddingHorizontal: spacing.gutter, paddingVertical: 12, gap: 6 },
  editLabel: { ...typography.subtitle, fontFamily: fonts.semibold, color: colors.text },
  editHint: { ...typography.caption, color: colors.textMuted },
  input: {
    minHeight: MIN_TOUCH,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTonal,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
    marginTop: spacing.xs,
  },
  rowError: { marginTop: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  action: { flex: 1 },
  removeAction: { marginTop: spacing.sm, alignSelf: 'flex-start', minWidth: 120 },
});
