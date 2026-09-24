import React, { useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Icon, Input } from '../../ui';
import { ChipSelect } from '../ChipSelect';
import { CERTIFICATES } from '../../features/products/glossaryLabels';
import { MAX_CERTIFICATES } from '../../features/products/limits';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import { passportStyles } from './styles';
import { emptyCertificateRow, type CertificateRow } from './rows';
import { DocField } from './DocField';
import { tr } from '../../i18n';

const CERTIFICATE_OPTIONS = CERTIFICATES.map((c) => ({ value: c.key, label: c.label }));

interface Props {
  rows: CertificateRow[];
  // `change` 'image' ise değişen yalnızca belge fotoğrafıdır (kumaş formu
  // "etiketten okundu" işaretini o durumda düşürmüyor).
  onChange: (rows: CertificateRow[], change?: 'image') => void;
  // Hiç satır yokken görünen açıklama.
  hint?: string;
  // Fotoğraf seçmede oluşan hata metni (null: temizle).
  onError?: (message: string | null) => void;
  // Fotoğraf seçme durumu dışarıdan yönetilebilir (kumaş formunda test
  // raporlarıyla aynı durumu paylaşıyor); verilmezse bileşen kendi tutar.
  picking?: string | null;
  onPickingChange?: (key: string | null) => void;
  disabled?: boolean;
}

// Sertifika satır editörü (ad, belge no, geçerlilik tarihi, belge fotoğrafı).
// Kumaş ve iplik formu aynı bileşeni kullanır.
export function CertificatesEditor({
  rows,
  onChange,
  hint,
  onError,
  picking,
  onPickingChange,
  disabled,
}: Props) {
  const t = useTheme();
  const styles = passportStyles(t);
  const [ownPicking, setOwnPicking] = useState<string | null>(null);
  const pickingKey = picking !== undefined ? picking : ownPicking;
  const setPicking = (key: string | null) => {
    if (onPickingChange) onPickingChange(key);
    else setOwnPicking(key);
  };

  // Fotoğraf seçimi asenkron; satırlar o sırada değişmiş olabilir.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const updateRow = (key: string, patch: Partial<CertificateRow>) =>
    onChange(
      rowsRef.current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
      'image' in patch ? 'image' : undefined
    );

  const addRow = () => {
    if (rows.length >= MAX_CERTIFICATES) return;
    haptics.selection();
    onChange([...rows, emptyCertificateRow()]);
  };

  const removeRow = (key: string) => {
    haptics.selection();
    onChange(rows.filter((row) => row.key !== key));
  };

  const field = { marginBottom: t.space[4] };

  return (
    <>
      {rows.length === 0 && hint ? <Text style={styles.labelHint}>{hint}</Text> : null}
      {rows.map((row, index) => (
        <View key={row.key} style={styles.rowCard}>
          <View style={styles.rowCardHead}>
            <Text style={styles.rowCardTitle}>{index + 1}. sertifika</Text>
            <Pressable
              onPress={() => removeRow(row.key)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={tr('{n}. sertifika satırını kaldır', { n: index + 1 })}
              style={({ pressed }) => [styles.rowRemove, pressed && styles.rowRemovePressed]}
            >
              <Icon name="x" color="ink2" />
            </Pressable>
          </View>
          <ChipSelect
            options={CERTIFICATE_OPTIONS}
            value={row.name}
            onChange={(name) => updateRow(row.key, { name })}
            compact
          />
          <Input
            label={tr('Belge no')}
            helper={tr('İsteğe bağlı')}
            value={row.number}
            onChangeText={(number) => updateRow(row.key, { number })}
            placeholder={tr('Örn. 21.0.12345')}
            editable={!disabled}
            containerStyle={field}
          />
          <Input
            label={tr('Geçerlilik tarihi')}
            helper={tr('YYYY-AA-GG, isteğe bağlı')}
            value={row.validUntil}
            onChangeText={(validUntil) => updateRow(row.key, { validUntil })}
            placeholder={tr('Örn. 2027-03-01')}
            autoCapitalize="none"
            editable={!disabled}
            containerStyle={field}
          />
          <DocField
            image={row.image}
            onChange={(image) => updateRow(row.key, { image })}
            busy={pickingKey === row.key}
            onBusyChange={(active) => setPicking(active ? row.key : null)}
            onError={onError}
            disabled={disabled || (pickingKey !== null && pickingKey !== row.key)}
            labelPrefix={tr('{n}. sertifika', { n: index + 1 })}
          />
        </View>
      ))}
      {rows.length < MAX_CERTIFICATES ? (
        <Pressable
          onPress={addRow}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={tr('Sertifika satırı ekle')}
          style={({ pressed }) => [styles.addRow, pressed && styles.addRowPressed]}
        >
          <Icon name="plus" size={t.size.iconSm} color="brand" />
          <Text style={styles.addRowText}>{tr('Sertifika ekle')}</Text>
        </Pressable>
      ) : null}
    </>
  );
}
