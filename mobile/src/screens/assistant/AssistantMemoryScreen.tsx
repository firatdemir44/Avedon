import React, { useCallback, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  deleteCompanyMemory,
  fetchCompanyMemory,
  setCompanyMemory,
  type MemoryEntry,
  type MemoryKeyDef,
} from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { useFocusLoad } from '../../features/useFocusLoad';
import { useTheme } from '../../theme/ThemeContext';
import {
  AppBar,
  Button,
  Card,
  EmptyState,
  Icon,
  Input,
  ListRow,
  Screen,
  SectionTitle,
  SkeletonRow,
} from '../../ui';

type Props = RootStackScreenProps<'AssistantMemory'>;

// Firma hafızası: asistanın hesaplarda varsayılan olarak ÖNERDİĞİ değerler
// (kur, fason ücreti, fire, kâr oranı...). Asistan buraya kendisi yazmaz;
// yazma ya sohbetteki öneri kartından ya da bu ekrandan olur.
//
// Yeni tasarım (DESIGN.md, 4. adım): kendi `AppBar`ı (navigation başlığı
// gizlendi), `Screen` iskeleti, `ListRow` / `Card` / `Input` / `Button`.

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

export function AssistantMemoryScreen({ navigation }: Props) {
  const t = useTheme();
  const { data, status, error, reload } = useFocusLoad(fetchCompanyMemory);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [rowError, setRowError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  React.useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

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

  const bar = <AppBar title="Firma hafızası" leading="back" onBack={() => navigation.goBack()} />;

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar}
        <Screen>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </Screen>
      </View>
    );
  }

  // Firması olmayan kullanıcıda sunucu 403 no_company döner.
  if (status === 'error' && error instanceof ApiError && error.status === 403) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar}
        <Screen>
          <EmptyState
            icon="business-outline"
            title="Firma hafızası firmaya bağlı"
            description="Bir firmaya bağlandığınızda kur, fason ücreti, fire ve kâr oranı gibi varsayılanları burada düzenlersiniz."
          />
        </Screen>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar}
        <Screen>
          <EmptyState
            icon="warning"
            title="Firma hafızası alınamadı"
            description={friendlyMessage(error, 'Bağlantıyı kontrol edip tekrar deneyin.')}
            actionLabel="Tekrar dene"
            onAction={reload}
          />
        </Screen>
      </View>
    );
  }

  const keys = data?.keys ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      {bar}
      <Screen>
        {/* Faz 2, Adım 3: satıcı asistanının alıcılara verdiği hazır cevaplar. */}
        <View style={{ gap: t.space[3] }}>
          <SectionTitle title="Alıcı soruları" />
          <ListRow
            title="Sık sorulanlar"
            subtitle="Asistanınız alıcı sorularını bu cevaplara göre yanıtlar"
            left={<Icon name="help-circle-outline" color="brand" />}
            divider={false}
            onPress={() => navigation.navigate('CompanyFaq')}
          />
        </View>

        <View style={{ gap: t.space[3] }}>
          <SectionTitle title="Kayıtlı değerler" />
          <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
            Asistan hesap yaparken bu değerleri varsayılan olarak önerir ve hangisini kullandığını söyler. Boş
            bırakılan değerleri her seferinde size sorar.
          </Text>
          {keys.map((def, index) => {
            const entry = entryByKey.get(def.key);
            const isEditing = editingKey === def.key;

            if (isEditing) {
              return (
                <Card key={def.key} style={{ gap: t.space[3] }}>
                  <Input
                    label={def.label}
                    helper={def.hint}
                    error={rowError}
                    value={draft}
                    onChangeText={setDraft}
                    autoFocus
                    keyboardType={def.kind === 'number' ? 'decimal-pad' : 'default'}
                    inputMode={def.kind === 'number' ? 'decimal' : 'text'}
                    multiline={def.kind === 'list'}
                    placeholder={def.hint}
                    accessibilityLabel={def.label}
                  />
                  <View style={{ flexDirection: 'row', gap: t.space[2], minWidth: 0 }}>
                    <Button
                      label="Kaydet"
                      loading={saving}
                      onPress={() => void save(def)}
                      style={{ flex: 1 }}
                    />
                    <Button
                      kind="secondary"
                      label="Vazgeç"
                      disabled={saving}
                      onPress={() => {
                        setEditingKey(null);
                        setRowError(null);
                      }}
                      style={{ flex: 1 }}
                    />
                  </View>
                  {entry ? (
                    <Button
                      kind="danger"
                      label="Sil"
                      icon="trash-outline"
                      disabled={saving}
                      onPress={() => void remove(def)}
                    />
                  ) : null}
                </Card>
              );
            }

            return (
              <ListRow
                key={def.key}
                title={def.label}
                subtitle={def.hint}
                divider={index < keys.length - 1}
                right={
                  <Text
                    numberOfLines={1}
                    style={[
                      entry ? t.type.mono14 : t.type.body14,
                      { color: entry ? t.colors.brand : t.colors.ink3, textAlign: 'right' },
                    ]}
                  >
                    {entry ? displayValue(entry.value) : 'Kayıtlı değil'}
                  </Text>
                }
                onPress={() => startEdit(def)}
              />
            );
          })}
        </View>
      </Screen>
    </View>
  );
}

