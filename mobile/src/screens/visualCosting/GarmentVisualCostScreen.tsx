// Görselden maliyet tablosu (yeni tasarım, 4. adım — DESIGN.md).
// İşlev aynı: fotoğraflar seçilir, backend bileşenleri tespit eder, miktar ve
// birim fiyatı kullanıcı girer, toplam hesaplanır. Yalnızca renk/yazı/köşe/boşluk
// token'lara bağlandı; ham hex ve ham px yok.
import React, { useLayoutEffect, useMemo, useState } from 'react';
import { View, Text, Image, Pressable, ActivityIndicator } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { detectGarmentComponents, type DetectedComponent, type GarmentImageInput } from '../../api/client';
import { pickCompressedImage } from '../../features/imagePicker';
import { parseNumber, formatNumber } from '../../features/calculators/parse';
import { useTheme } from '../../theme/ThemeContext';
import { AppBar, Button, Card, Icon, Input, Screen, SectionTitle } from '../../ui';

interface PickedImage extends GarmentImageInput {
  uri: string;
}

interface CostRow extends DetectedComponent {
  quantity: string;
  unitPrice: string;
}

const MAX_IMAGES = 4;

export function GarmentVisualCostScreen({ navigation }: RootStackScreenProps<'GarmentVisualCost'>) {
  const t = useTheme();
  const [images, setImages] = useState<PickedImage[]>([]);
  const [rows, setRows] = useState<CostRow[]>([]);
  const [addingImage, setAddingImage] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kendi üst bandımızı (AppBar) çiziyoruz; yığının başlığı kapanıyor.
  useLayoutEffect(() => navigation.setOptions({ headerShown: false }), [navigation]);

  const total = useMemo(
    () => rows.reduce((sum, row) => sum + parseNumber(row.quantity) * parseNumber(row.unitPrice), 0),
    [rows]
  );

  const addImage = async () => {
    if (images.length >= MAX_IMAGES) return;
    setAddingImage(true);
    setError(null);
    try {
      const picked = await pickCompressedImage();
      if (!picked) return;
      const base64 = picked.dataUrl.split(',')[1] ?? '';
      setImages((prev) => [...prev, { uri: picked.uri, imageBase64: base64, mediaType: 'image/jpeg' }]);
      setRows([]);
      setNotConfigured(false);
    } catch (err) {
      setError(
        err instanceof Error && err.message === 'permission_denied'
          ? 'Galeriye erişim izni verilmedi.'
          : 'Fotoğraf işlenemedi, lütfen başka bir fotoğraf deneyin.'
      );
    } finally {
      setAddingImage(false);
    }
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

  const notice = notConfigured
    ? "Görsel analiz henüz etkinleştirilmedi. Backend'de ANTHROPIC_API_KEY tanımlanmalı."
    : error;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title="Görselden maliyet" leading="back" onBack={() => navigation.goBack()} />
      <Screen>
        <Text style={[t.type.body14, { color: t.colors.ink3 }]}>
          Bir kıyafetin ön, arka gibi farklı açılardan fotoğraflarını ekleyin — AI hepsini birlikte değerlendirip
          görünen bileşenleri (yaka, kol, fermuar, cep, ön/arka baskı vb.) tek listede tespit eder, tekrar etmez.
          Miktar ve birim fiyatı siz girersiniz, sistem tahmin üretmez.
        </Text>

        {images.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[3] }}>
            {images.map((img, index) => (
              <View key={img.uri} style={{ width: t.size.thumb, height: t.size.thumb }}>
                <Image
                  source={{ uri: img.uri }}
                  accessibilityLabel={`${index + 1}. fotoğraf`}
                  style={{
                    width: t.size.thumb,
                    height: t.size.thumb,
                    borderRadius: t.radius.sm,
                    borderWidth: 1,
                    borderColor: t.colors.line,
                    backgroundColor: t.colors.surface2,
                  }}
                />
                <Pressable
                  onPress={() => removeImage(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`${index + 1}. fotoğrafı kaldır`}
                  hitSlop={8}
                  style={{
                    position: 'absolute',
                    top: -t.space[1],
                    right: -t.space[1],
                    width: t.size.badge,
                    height: t.size.badge,
                    borderRadius: t.radius.full,
                    backgroundColor: t.colors.danger,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="x" size={t.size.iconXs} colorValue={t.colors.onBrand} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ gap: t.space[3] }}>
          {images.length < MAX_IMAGES ? (
            <Button
              kind="secondary"
              icon="camera"
              label={
                addingImage
                  ? 'İşleniyor…'
                  : images.length === 0
                    ? 'Fotoğraf seç'
                    : `Fotoğraf ekle (${images.length}/${MAX_IMAGES})`
              }
              onPress={addImage}
              loading={addingImage}
              fullWidth
            />
          ) : null}

          {images.length > 0 ? (
            <Button
              label={analyzing ? 'Analiz ediliyor…' : 'Bileşenleri tespit et'}
              onPress={analyze}
              loading={analyzing}
              fullWidth
            />
          ) : null}
        </View>

        {notice ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.space[2] }}>
            <Icon name="warning" size={t.size.iconSm} color="danger" />
            <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{notice}</Text>
          </View>
        ) : null}
        {analyzing ? <ActivityIndicator color={t.colors.brand} /> : null}

        {rows.length > 0 ? (
          <View style={{ gap: t.space[3] }}>
            <SectionTitle title="Maliyet kalemleri" />
            {rows.map((row, index) => (
              <Card key={`${row.component}-${index}`}>
                <View style={{ gap: t.space[3] }}>
                  <View style={{ gap: t.space[1] }}>
                    <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>{row.component}</Text>
                    <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{row.detail}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: t.space[3] }}>
                    <Input
                      containerStyle={{ flex: 1, minWidth: 0 }}
                      label="Miktar"
                      inputMode="decimal"
                      keyboardType="decimal-pad"
                      value={row.quantity}
                      onChangeText={(v) => updateRow(index, { quantity: v })}
                    />
                    <Input
                      containerStyle={{ flex: 1, minWidth: 0 }}
                      label="Birim fiyat"
                      unit="₺"
                      inputMode="decimal"
                      keyboardType="decimal-pad"
                      value={row.unitPrice}
                      onChangeText={(v) => updateRow(index, { unitPrice: v })}
                      placeholder="0"
                    />
                  </View>
                </View>
              </Card>
            ))}

            {/* Tek büyük sonuç (DESIGN.md §5): vurgulu satır, display-28. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.space[2],
                minHeight: t.size.touchMin,
                paddingHorizontal: t.space[4],
                paddingVertical: t.space[3],
                borderRadius: t.radius.lg,
                backgroundColor: t.colors.surfaceBrand,
              }}
              accessibilityLabel={`Toplam maliyet: ${formatNumber(total)} lira`}
            >
              <Text style={[t.type.label14, { color: t.colors.onBrand, flex: 1, minWidth: 0 }]}>Toplam maliyet</Text>
              <Text
                numberOfLines={1}
                style={[t.type.display28, { color: t.colors.onBrand, textAlign: 'right', flexShrink: 1 }]}
              >
                {formatNumber(total)}
              </Text>
              <Text style={[t.type.mono14, { color: t.colors.onBrand }]}>₺</Text>
            </View>
          </View>
        ) : null}
      </Screen>
    </View>
  );
}
