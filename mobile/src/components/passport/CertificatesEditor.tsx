import React, { useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TextField } from '../TextField';
import { ChipSelect } from '../ChipSelect';
import { CERTIFICATES } from '../../features/products/glossaryLabels';
import { MAX_CERTIFICATES } from '../../features/products/limits';
import { haptics } from '../../features/haptics';
import { colors } from '../../theme';
import { rowStyles as styles } from './styles';
import { emptyCertificateRow, type CertificateRow } from './rows';
import { DocField } from './DocField';

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
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${index + 1}. sertifika satırını kaldır`}
              style={({ pressed }) => [styles.rowRemove, pressed && styles.rowRemovePressed]}
            >
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
          <ChipSelect
            options={CERTIFICATE_OPTIONS}
            value={row.name}
            onChange={(name) => updateRow(row.key, { name })}
            compact
          />
          <TextField
            label="Belge no (isteğe bağlı)"
            value={row.number}
            onChangeText={(number) => updateRow(row.key, { number })}
            placeholder="Örn. 21.0.12345"
            editable={!disabled}
          />
          <TextField
            label="Geçerlilik tarihi (YYYY-AA-GG, isteğe bağlı)"
            value={row.validUntil}
            onChangeText={(validUntil) => updateRow(row.key, { validUntil })}
            placeholder="Örn. 2027-03-01"
            autoCapitalize="none"
            editable={!disabled}
          />
          <DocField
            image={row.image}
            onChange={(image) => updateRow(row.key, { image })}
            busy={pickingKey === row.key}
            onBusyChange={(active) => setPicking(active ? row.key : null)}
            onError={onError}
            disabled={disabled || (pickingKey !== null && pickingKey !== row.key)}
            labelPrefix={`${index + 1}. sertifika`}
          />
        </View>
      ))}
      {rows.length < MAX_CERTIFICATES ? (
        <Pressable
          onPress={addRow}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Sertifika satırı ekle"
          style={({ pressed }) => [styles.addRow, pressed && styles.addRowPressed]}
        >
          <Ionicons name="add" size={18} color={colors.accent} />
          <Text style={styles.addRowText}>Sertifika ekle</Text>
        </Pressable>
      ) : null}
    </>
  );
}
