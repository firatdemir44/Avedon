import React, { useState } from 'react';
import { View, Text, Image, ActivityIndicator } from 'react-native';
import { Button, Icon, ListRow } from '../../ui';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import { passportStyles } from './styles';
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
  const t = useTheme();
  const styles = passportStyles(t);
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
              <Icon name="document-text-outline" size={t.size.iconSm} color="danger" />
              <Text style={styles.docPdfText}>PDF</Text>
            </View>
          ) : image.uri ? (
            <View style={styles.docPhoto}>
              <Image source={{ uri: image.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </View>
          ) : (
            <View style={[styles.docPhoto, styles.docLoading]}>
              <ActivityIndicator color={t.colors.ink3} />
            </View>
          )
        ) : (
          <View style={[styles.docPhoto, styles.docPhotoEmpty]}>
            <Icon name="document-outline" size={t.size.iconSm} color="ink3" />
          </View>
        )}
        <View style={styles.docActions}>
          <Button
            kind="secondary"
            label={busy ? 'Seçiliyor...' : image.kind === 'none' ? 'Belge ekle' : 'Değiştir'}
            onPress={() => {
              haptics.selection();
              onError?.(null);
              setSourceOpen((v) => !v);
            }}
            disabled={disabled || busy}
            accessibilityLabel={`${labelPrefix} belgesi seç`}
          />
          {image.kind !== 'none' ? (
            <Button
              kind="quiet"
              label="Kaldır"
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
            left={<Icon name="image-outline" color="brand" />}
            onPress={() => pick('photo')}
          />
          <ListRow
            title="PDF dosyası"
            subtitle="En fazla 1,5 MB"
            left={<Icon name="document-text-outline" color="danger" />}
            divider={false}
            onPress={() => pick('pdf')}
          />
        </View>
      ) : null}
    </>
  );
}
