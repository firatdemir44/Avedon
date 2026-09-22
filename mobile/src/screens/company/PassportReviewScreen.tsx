// Etiketten okunanların onay ekranı (yeni tasarım, 4. adım — DESIGN.md §2/§3).
// Hiçbir şey kaydetmez: işaretli alanlar ürün formuna aktarılır, kullanıcı
// formu normal kaydeder. Görünüm: okunan alanlar `Card` içinde işaretlenebilir
// satırlar + güven rozeti (`Badge`), eksikler ayrı kart, altta tek dolu
// "Forma aktar" + kenarlıklı "Vazgeç".
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import type { ExtractionFieldName } from '../../api/client';
import {
  AUTO_SELECT_CONFIDENCE,
  CERTAIN_CONFIDENCE,
  EXTRACTION_FIELDS,
  FIELD_LABELS,
  REJECT_REASON_LABELS,
  buildPassportImport,
  formatFieldValue,
  hasValue,
} from '../../features/products/passportImport';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import { AppBar, Badge, Button, Card, Icon, Screen, SectionTitle, type BadgeKind } from '../../ui';

type Props = RootStackScreenProps<'PassportReview'>;

// Güven rozeti: yüksekse etikette birebir yazıyor, ortadaysa kontrol edilmeli,
// düşükse şüpheli (varsayılan olarak işaretsiz gelir).
function confidenceBadge(confidence: number): { kind: BadgeKind; label: string } {
  if (confidence >= CERTAIN_CONFIDENCE) return { kind: 'verified', label: 'Etikette yazıyor' };
  if (confidence >= AUTO_SELECT_CONFIDENCE) return { kind: 'pending', label: 'Kontrol edin' };
  return { kind: 'cancelled', label: 'Şüpheli' };
}

// Sayı ve kod alanları eşit aralıklı yazıyla.
function isMonoField(field: ExtractionFieldName) {
  return field === 'code' || field === 'weightGsm' || field === 'widthCm' || field === 'yarns';
}

export function PassportReviewScreen({ navigation, route }: Props) {
  const t = useTheme();
  const { productId, outcome } = route.params;
  const { extraction, warnings, rejected, meta } = outcome;

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const readFields = useMemo(
    () => EXTRACTION_FIELDS.filter((field) => hasValue(extraction, field)),
    [extraction]
  );
  const missingFields = useMemo(
    () => EXTRACTION_FIELDS.filter((field) => !hasValue(extraction, field)),
    [extraction]
  );

  // Varsayılan: güveni eşiğin üstünde olanlar işaretli.
  const [selected, setSelected] = useState<ExtractionFieldName[]>(() =>
    readFields.filter((field) => extraction[field].confidence >= AUTO_SELECT_CONFIDENCE)
  );

  const toggle = (field: ExtractionFieldName) => {
    haptics.selection();
    setSelected((prev) => (prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]));
  };

  const transfer = () => {
    const order = readFields.filter((field) => selected.includes(field));
    const passportImport = buildPassportImport(extraction, order);
    // Form ekranı yığında ayakta: popTo ile ona GERİ dönülüyor (React Navigation
    // 7'de navigate geri gitmez, formun ikinci kopyasını açar), merge ile
    // girilen diğer bilgiler (fotoğraf, stok, fiyat) korunuyor.
    navigation.popTo('AddProduct', { productId, passportImport, importKey: Date.now() }, { merge: true });
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title="Etiketten okunanlar" leading="back" onBack={() => navigation.goBack()} />
      <Screen
        sticky={
          <View style={{ flexDirection: 'row', gap: t.space[3] }}>
            <Button kind="secondary" label="Vazgeç" onPress={() => navigation.goBack()} style={{ flex: 1 }} />
            <Button
              label={`Forma aktar (${selected.length})`}
              disabled={selected.length === 0}
              onPress={transfer}
              style={{ flex: 2 }}
            />
          </View>
        }
      >
        <View style={{ gap: t.space[1] }}>
          <Text style={[t.type.body16, { color: t.colors.ink }]}>
            İşaretli alanlar forma aktarılır; sonra düzenleyebilirsiniz.
          </Text>
          {meta.mock ? (
            <Text style={[t.type.body14, { color: t.colors.ink2 }]}>Test kipi: gerçek model çağrılmadı.</Text>
          ) : null}
        </View>

        {warnings.notes.length ? (
          <View
            accessibilityRole="alert"
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: t.space[2],
              padding: t.space[3],
              borderRadius: t.radius.md,
              backgroundColor: t.colors.warningSoft,
            }}
          >
            <Icon name="warning" size={t.size.iconSm} color="warning" />
            <View style={{ flex: 1, minWidth: 0, gap: t.space[1] }}>
              <Text style={[t.type.label14, { color: t.colors.warning }]}>Dikkat</Text>
              {warnings.notes.map((note) => (
                <Text key={note} style={[t.type.body14, { color: t.colors.ink }]}>
                  {note}
                </Text>
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ gap: t.space[3] }}>
          <SectionTitle title={`Okunan alanlar (${readFields.length})`} />
          <Card noPadding>
            {readFields.length === 0 ? (
              <Text style={[t.type.body14, { color: t.colors.ink2, padding: t.space[4] }]}>
                Etiketten hiçbir alan okunamadı. Bilgileri elle girebilirsiniz.
              </Text>
            ) : null}
            {readFields.map((field, index) => {
              const checked = selected.includes(field);
              const badge = confidenceBadge(extraction[field].confidence);
              const evidence = extraction[field].evidence;
              const value = formatFieldValue(extraction, field);
              return (
                <Pressable
                  key={field}
                  onPress={() => toggle(field)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  // react-native-web accessibilityState.checked'i aria-checked'e
                  // çevirmiyor; ekran okuyucu seçimi duysun.
                  aria-checked={checked}
                  accessibilityLabel={`${FIELD_LABELS[field]}, ${value}, ${badge.label}`}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: t.space[3],
                    minHeight: t.size.row,
                    paddingHorizontal: t.space[4],
                    paddingVertical: t.space[3],
                    borderBottomWidth: index < readFields.length - 1 ? 1 : 0,
                    borderBottomColor: t.colors.line,
                    backgroundColor: pressed ? t.colors.surface2 : 'transparent',
                  })}
                >
                  <Icon
                    name={checked ? 'checkbox-outline' : 'square-outline'}
                    color={checked ? 'brand' : 'ink3'}
                  />
                  <View style={{ flex: 1, minWidth: 0, gap: t.space[1] }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: t.space[2],
                        flexWrap: 'wrap',
                      }}
                    >
                      <Text style={[t.type.label14, { color: t.colors.ink2, flexShrink: 1 }]}>{FIELD_LABELS[field]}</Text>
                      <Badge kind={badge.kind} label={badge.label} />
                    </View>
                    <Text style={[isMonoField(field) ? t.type.mono14 : t.type.body16, { color: t.colors.ink }]}>
                      {value}
                    </Text>
                    {evidence ? (
                      <Text style={[t.type.body14, { color: t.colors.ink2 }]}>Okunan: {evidence}</Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </Card>
        </View>

        {missingFields.length ? (
          <View style={{ gap: t.space[3] }}>
            <SectionTitle title={`Bulunamadı (${missingFields.length})`} />
            <Card>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
                {missingFields.map((field) => (
                  <Badge key={field} kind="info" label={FIELD_LABELS[field]} />
                ))}
              </View>
              <Text style={[t.type.body14, { color: t.colors.ink2, marginTop: t.space[3] }]}>
                Bu alanlar etikette okunamadı; formda elle girebilirsiniz.
              </Text>
            </Card>
          </View>
        ) : null}

        {rejected.length ? (
          <View style={{ gap: t.space[3] }}>
            <SectionTitle title={`Okundu ama aktarılmadı (${rejected.length})`} />
            <Card noPadding>
              {rejected.map((item, index) => (
                <View
                  key={`${item.field}-${item.raw}-${index}`}
                  style={{
                    paddingHorizontal: t.space[4],
                    paddingVertical: t.space[3],
                    gap: t.space[1],
                    borderBottomWidth: index < rejected.length - 1 ? 1 : 0,
                    borderBottomColor: t.colors.line,
                  }}
                >
                  <Text style={[t.type.body16, { color: t.colors.ink }]}>{item.raw}</Text>
                  <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                    {REJECT_REASON_LABELS[item.reason] ?? item.reason}
                  </Text>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        {extraction.notes.trim() ? (
          <View style={{ gap: t.space[3] }}>
            <SectionTitle title="Notlar" />
            <Card>
              <Text style={[t.type.body16, { color: t.colors.ink }]}>{extraction.notes.trim()}</Text>
            </Card>
          </View>
        ) : null}
      </Screen>
    </View>
  );
}
