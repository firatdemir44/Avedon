import React, { useMemo, useState } from 'react';
import { View, Text, Image, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { PrimaryButton } from '../../components/PrimaryButton';
import { TextField } from '../../components/TextField';
import { detectGarmentComponents, type DetectedComponent, type GarmentImageInput } from '../../api/client';
import { parseNumber, formatNumber } from '../../features/calculators/parse';
import { colors, radius, spacing } from '../../theme';

interface PickedImage extends GarmentImageInput {
  uri: string;
}

interface CostRow extends DetectedComponent {
  quantity: string;
  unitPrice: string;
}

const MAX_IMAGES = 4;

function detectMediaType(mimeType: string | undefined): GarmentImageInput['mediaType'] {
  if (mimeType === 'image/png') return 'image/png';
  if (mimeType === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

export function GarmentVisualCostScreen() {
  const [images, setImages] = useState<PickedImage[]>([]);
  const [rows, setRows] = useState<CostRow[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(
    () => rows.reduce((sum, row) => sum + parseNumber(row.quantity) * parseNumber(row.unitPrice), 0),
    [rows]
  );

  const addImage = async () => {
    if (images.length >= MAX_IMAGES) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Galeriye erişim izni verilmedi.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    if (!asset.base64) return;

    setImages((prev) => [
      ...prev,
      { uri: asset.uri, imageBase64: asset.base64!, mediaType: detectMediaType(asset.mimeType) },
    ]);
    setRows([]);
    setError(null);
    setNotConfigured(false);
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setRows([]);
  };

  const analyze = async () => {
    if (images.length === 0) return;
    setAnalyzing(true);
    setError(null);
    try {
      const { components } = await detectGarmentComponents(
        images.map(({ imageBase64, mediaType }) => ({ imageBase64, mediaType }))
      );
      setRows(components.map((c) => ({ ...c, quantity: '1', unitPrice: '' })));
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'analysis_not_configured') {
        setNotConfigured(true);
      } else {
        setError('Analiz başarısız oldu, lütfen tekrar deneyin.');
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const updateRow = (index: number, patch: Partial<CostRow>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>
          Bir kıyafetin ön, arka gibi farklı açılardan fotoğraflarını ekleyin — AI hepsini birlikte değerlendirip
          görünen bileşenleri (yaka, kol, fermuar, cep, ön/arka baskı vb.) tek listede tespit eder, tekrar etmez.
          Miktar ve birim fiyatı siz girersiniz, sistem tahmin üretmez.
        </Text>

        {images.length > 0 ? (
          <View style={styles.imageRow}>
            {images.map((img, index) => (
              <View key={img.uri} style={styles.imageWrapper}>
                <Image source={{ uri: img.uri }} style={styles.thumbnail} />
                <Pressable style={styles.removeBadge} onPress={() => removeImage(index)}>
                  <Text style={styles.removeBadgeText}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {images.length < MAX_IMAGES ? (
          <PrimaryButton
            label={images.length === 0 ? 'Fotoğraf Seç' : `Fotoğraf Ekle (${images.length}/${MAX_IMAGES})`}
            onPress={addImage}
            variant="secondary"
          />
        ) : null}

        {images.length > 0 ? (
          <PrimaryButton
            label={analyzing ? 'Analiz ediliyor...' : 'Bileşenleri Tespit Et'}
            onPress={analyze}
            disabled={analyzing}
            style={{ marginTop: spacing.sm }}
          />
        ) : null}

        {notConfigured ? (
          <Text style={styles.notice}>Görsel analiz henüz etkinleştirilmedi. Backend'de ANTHROPIC_API_KEY tanımlanmalı.</Text>
        ) : null}
        {error ? <Text style={styles.notice}>{error}</Text> : null}
        {analyzing ? <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.primary} /> : null}

        {rows.length > 0 ? (
          <View style={styles.table}>
            <Text style={styles.sectionTitle}>Maliyet Kalemleri</Text>
            {rows.map((row, index) => (
              <View key={`${row.component}-${index}`} style={styles.row}>
                <Text style={styles.rowTitle}>{row.component}</Text>
                <Text style={styles.rowDetail}>{row.detail}</Text>
                <View style={styles.rowInputs}>
                  <View style={{ flex: 1 }}>
                    <TextField
                      label="Miktar"
                      keyboardType="numeric"
                      value={row.quantity}
                      onChangeText={(v) => updateRow(index, { quantity: v })}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextField
                      label="Birim Fiyat (₺)"
                      keyboardType="numeric"
                      value={row.unitPrice}
                      onChangeText={(v) => updateRow(index, { unitPrice: v })}
                      placeholder="0"
                    />
                  </View>
                </View>
              </View>
            ))}
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>Toplam Maliyet</Text>
              <Text style={styles.totalValue}>{formatNumber(total)} ₺</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  hint: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.md },
  imageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  imageWrapper: {
    width: 100,
    height: 100,
  },
  thumbnail: {
    width: 100,
    height: 100,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  removeBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  notice: { fontSize: 13, color: colors.danger, marginTop: spacing.md },
  table: { marginTop: spacing.lg },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  row: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowDetail: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.sm },
  rowInputs: { flexDirection: 'row', gap: spacing.sm },
  totalCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  totalLabel: { fontSize: 15, color: colors.textMuted },
  totalValue: { fontSize: 18, fontWeight: '700', color: colors.text },
});
