import React, { useRef, useState } from 'react';
import { View, Text, Image, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TextField } from '../TextField';
import { ChipSelect } from '../ChipSelect';
import { PrimaryButton } from '../PrimaryButton';
import { CERTIFICATES } from '../../features/products/glossaryLabels';
import { MAX_CERTIFICATES } from '../../features/products/limits';
import { haptics } from '../../features/haptics';
import { colors } from '../../theme';
import { rowStyles as styles } from './styles';
import { emptyCertificateRow, pickDocImage, type CertificateRow } from './rows';

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

  const addPhoto = async (key: string) => {
    setPicking(key);
    onError?.(null);
    const result = await pickDocImage();
    setPicking(null);
    if (!result) return;
    if ('error' in result) {
      onError?.(result.error);
      return;
    }
    updateRow(key, { image: result.image });
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
          <Text style={styles.label}>Belge fotoğrafı</Text>
          <View style={styles.docRow}>
            {row.image.kind !== 'none' ? (
              row.image.uri ? (
                <Image source={{ uri: row.image.uri }} style={styles.docPhoto} />
              ) : (
                <View style={[styles.docPhoto, styles.docLoading]}>
                  <ActivityIndicator color={colors.chevron} />
                </View>
              )
            ) : (
              <View style={[styles.docPhoto, styles.docPhotoEmpty]}>
                <Ionicons name="document-outline" size={20} color={colors.chevron} />
              </View>
            )}
            <View style={styles.docActions}>
              <PrimaryButton
                label={pickingKey === row.key ? 'Seçiliyor...' : row.image.kind === 'none' ? 'Fotoğraf Ekle' : 'Değiştir'}
                variant="outline"
                onPress={() => addPhoto(row.key)}
                disabled={disabled || pickingKey !== null}
                accessibilityLabel={`${index + 1}. sertifika belgesi fotoğrafı seç`}
              />
              {row.image.kind !== 'none' ? (
                <PrimaryButton
                  label="Kaldır"
                  variant="outline"
                  onPress={() => {
                    haptics.selection();
                    updateRow(row.key, { image: { kind: 'none' } });
                  }}
                  disabled={disabled}
                  accessibilityLabel={`${index + 1}. sertifika belgesi fotoğrafını kaldır`}
                />
              ) : null}
            </View>
          </View>
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
