import React, { useState } from 'react';
import { View, Text, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ListRow } from '../ListRow';
import { PrimaryButton } from '../PrimaryButton';
import { haptics } from '../../features/haptics';
import { colors } from '../../theme';
import { rowStyles as styles } from './styles';
import { isPdfDoc, pickDocImage, pickDocPdf, type DocImage } from './rows';

interface Props {
  // Satırın belgesi (yok · sunucudaki · yeni seçilen).
  image: DocImage;
  onChange: (image: DocImage) => void;
  // Başka bir satırda seçim sürüyorsa hepsi kilitlenir.
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onError?: (message: string | null) => void;
  disabled?: boolean;
  // Erişilebilirlik etiketlerinin başı: "1. sertifika".
  labelPrefix: string;
}

/**
 * Sertifika / test raporu satırındaki belge alanı. Belge fotoğraf ya da PDF
 * olabilir (Textile Exchange sertifikaları PDF geliyor); seçim ekran içinde
 * açılan kutuyla yapılır, çünkü web'de Alert.alert hiçbir şey göstermiyor.
 */
export function DocField({ image, onChange, busy, onBusyChange, onError, disabled, labelPrefix }: Props) {
  const [sourceOpen, setSourceOpen] = useState(false);
  const pdf = isPdfDoc(image);

  const pick = async (kind: 'photo' | 'pdf') => {
    setSourceOpen(false);
    onError?.(null);
    onBusyChange(true);
    const result = kind === 'photo' ? await pickDocImage() : await pickDocPdf();
    onBusyChange(false);
    if (!result) return;
    if ('error' in result) {
      onError?.(result.error);
      return;
    }
    onChange(result.image);
  };

  return (
    <>
      <Text style={styles.label}>Belge (fotoğraf ya da PDF)</Text>
      <View style={styles.docRow}>
        {image.kind !== 'none' ? (
          pdf ? (
            <View style={[styles.docPhoto, styles.docPdf]}>
              <Ionicons name="document-text-outline" size={22} color={colors.danger} />
              <Text style={styles.docPdfText}>PDF</Text>
            </View>
          ) : image.uri ? (
            <Image source={{ uri: image.uri }} style={styles.docPhoto} />
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
            label={busy ? 'Seçiliyor...' : image.kind === 'none' ? 'Belge Ekle' : 'Değiştir'}
            variant="outline"
            onPress={() => {
              haptics.selection();
              onError?.(null);
              setSourceOpen((v) => !v);
            }}
            disabled={disabled || busy}
            accessibilityLabel={`${labelPrefix} belgesi seç`}
          />
          {image.kind !== 'none' ? (
            <PrimaryButton
              label="Kaldır"
              variant="outline"
              onPress={() => {
                haptics.selection();
                setSourceOpen(false);
                onChange({ kind: 'none' });
              }}
              disabled={disabled || busy}
              accessibilityLabel={`${labelPrefix} belgesini kaldır`}
            />
          ) : null}
        </View>
      </View>
      {sourceOpen && !busy ? (
        <View style={styles.docSourceBox}>
          <ListRow
            title="Fotoğraf"
            subtitle="Galeriden belge fotoğrafı"
            left={<Ionicons name="image-outline" size={20} color={colors.primary} />}
            onPress={() => pick('photo')}
          />
          <ListRow
            title="PDF dosyası"
            subtitle="En fazla 1,5 MB"
            left={<Ionicons name="document-text-outline" size={20} color={colors.danger} />}
            divider={false}
            onPress={() => pick('pdf')}
          />
        </View>
      ) : null}
    </>
  );
}
