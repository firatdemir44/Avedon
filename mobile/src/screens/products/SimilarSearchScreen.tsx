import React, { useState } from 'react';
import { ActivityIndicator, Image, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ApiError,
  MAX_LOOK_IMAGE_CHARS,
  searchSimilarByPhoto,
  type LookSearchResult,
  type SimilarProductResult,
} from '../../api/client';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ProductRow } from '../../components/ProductRow';
import { SectionHeader } from '../../components/SectionHeader';
import { EmptyState, InlineError } from '../../components/StateView';
import { pickLookPhoto } from '../../features/imagePicker';
import { haptics } from '../../features/haptics';
import type { RootStackScreenProps } from '../../navigation/types';
import { colors, fonts, radius, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'SimilarSearch'>;

// Faz 3, Adım 3: "Fotoğrafla benzerini bul". Sunucu yalnızca GÖRÜNÜMÜ
// karşılaştırır (desen, renk, yüzey, doku); gramaj ve içerik fotoğraftan
// okunmaz — bu sınır ekranda açıkça yazılı, sonuçların üstünde durur.
const HONESTY_NOTE =
  'Yalnızca görünüm karşılaştırılır. Gramaj ve içerik fotoğraftan okunamaz; ürün sayfasından kontrol edin.';

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'daily_limit') return 'Günlük 20 arama sınırına ulaştınız, yarın tekrar deneyin.';
    if (err.code === 'llm_not_configured') return 'Görsel arama şu anda kapalı. Daha sonra tekrar deneyin.';
    if (err.code === 'look_failed') return 'Fotoğraf incelenemedi. Lütfen tekrar deneyin.';
    if (err.code === 'unsupported_image' || err.code === 'invalid_body')
      return 'Bu fotoğraf kullanılamadı. Başka bir fotoğrafla deneyin.';
    if (err.status === 401) return 'Bu arama için giriş yapmanız gerekiyor.';
    return err.message;
  }
  if (err instanceof Error) {
    if (err.message === 'camera_permission_denied') return 'Kameraya erişim izni verilmedi.';
    if (err.message === 'permission_denied') return 'Galeriye erişim izni verilmedi.';
    if (err.message === 'image_too_large')
      return 'Fotoğraf çok büyük. Daha küçük çözünürlükte bir fotoğrafla deneyin.';
  }
  return 'Arama yapılamadı, lütfen tekrar deneyin.';
}

export function SimilarSearchScreen({ navigation }: Props) {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<LookSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async (source: 'camera' | 'gallery') => {
    setError(null);
    let picked;
    try {
      picked = await pickLookPhoto(source, MAX_LOOK_IMAGE_CHARS);
    } catch (err) {
      setError(errorMessage(err));
      return;
    }
    if (!picked) return;

    setPhotoUri(picked.uri);
    setResult(null);
    setSearching(true);
    try {
      const found = await searchSimilarByPhoto(picked.dataUrl);
      setResult(found);
      haptics.success();
    } catch (err) {
      haptics.error();
      setError(errorMessage(err));
    } finally {
      setSearching(false);
    }
  };

  const reset = () => {
    setPhotoUri(null);
    setResult(null);
    setError(null);
  };

  const pickers = (
    <View style={styles.pickerRow}>
      {/* Kamera yalnızca telefonda; web'de tarayıcı kamerası yok, dosya seçici kalır. */}
      {Platform.OS !== 'web' ? (
        <PrimaryButton
          label="Fotoğraf çek"
          icon="camera-outline"
          size="lg"
          onPress={() => start('camera')}
          style={styles.pickerButton}
        />
      ) : null}
      <PrimaryButton
        label="Galeriden seç"
        icon="images-outline"
        variant="outline"
        size="lg"
        onPress={() => start('gallery')}
        style={styles.pickerButton}
      />
    </View>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {!photoUri && !searching ? (
        <View style={styles.block}>
          <Text style={styles.introTitle}>Elinizdeki kumaşın benzerini bulun</Text>
          <Text style={styles.introText}>
            Kumaşı düz bir zeminde, yakından ve iyi ışıkta çekin. Platformdaki ürünlerin fotoğraflarıyla
            görünüm olarak karşılaştırılır.
          </Text>
          {pickers}
          <Text style={styles.note}>{HONESTY_NOTE}</Text>
        </View>
      ) : null}

      {photoUri ? (
        <View style={[styles.block, styles.previewBlock]}>
          <Image source={{ uri: photoUri }} style={styles.preview} accessibilityLabel="Aranan fotoğraf" />
          <View style={styles.previewTexts}>
            {searching ? (
              <>
                <Text style={styles.previewTitle}>Kumaşın görünümü inceleniyor</Text>
                <Text style={styles.previewMeta}>Birkaç saniye sürebilir.</Text>
              </>
            ) : result ? (
              <>
                <Text style={styles.previewTitle} numberOfLines={3}>
                  Gördüğümüz: {result.look.summary}
                </Text>
                {result.remaining <= 5 ? (
                  <Text style={styles.previewMeta}>Bugün {result.remaining} arama hakkınız kaldı</Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.previewTitle}>Seçilen fotoğraf</Text>
            )}
          </View>
          {searching ? <ActivityIndicator color={colors.primary} /> : null}
        </View>
      ) : null}

      {searching ? <SearchingSkeleton /> : null}

      {error ? <InlineError message={error} style={styles.banner} /> : null}

      {result && !searching ? (
        <>
          {!result.recognized ? (
            <EmptyState
              icon="camera-outline"
              title="Fotoğrafta kumaşı seçemedik"
              message="Kumaşı düz bir zeminde, yakından ve iyi ışıkta çekip yeniden deneyin."
              style={styles.stateBlock}
            />
          ) : result.results.length === 0 ? (
            <EmptyState
              icon="search-outline"
              title="Görünüşçe benzeyen ürün bulunamadı"
              message="Katalog büyüdükçe sonuçlar artar."
              style={styles.stateBlock}
            />
          ) : (
            <>
              <SectionHeader title="Benzer kumaşlar" count={result.results.length} />
              <Text style={styles.honestyStrip}>{HONESTY_NOTE}</Text>
              <View style={[styles.block, styles.listBlock]}>
                {result.results.map((item, index) => (
                  <SimilarResultRow
                    key={item.product.id}
                    item={item}
                    divider={index < result.results.length - 1}
                    onPress={() => navigation.navigate('ProductDetail', { productId: item.product.id })}
                  />
                ))}
              </View>
            </>
          )}

          <View style={[styles.block, styles.againBlock]}>
            <PrimaryButton label="Başka fotoğrafla ara" variant="outline" size="lg" onPress={reset} />
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

// Ürün satırının altında benzerlik rozeti ve nedenler. ProductRow'un kendisi
// değiştirilmedi: rozet satırın ALTINDA ayrı bir şeritte duruyor, böylece
// iç içe dokunma alanı oluşmuyor (web kuralı).
function SimilarResultRow({
  item,
  divider,
  onPress,
}: {
  item: SimilarProductResult;
  divider: boolean;
  onPress: () => void;
}) {
  return (
    <View style={divider ? styles.resultDivider : undefined}>
      <ProductRow product={item.product} onPress={onPress} divider={false} />
      <View style={styles.reasonRow}>
        <View style={styles.similarityBadge}>
          <Text style={styles.similarityText}>%{item.similarity} benzer</Text>
        </View>
        {item.reasons.slice(0, 3).map((reason) => (
          <View key={reason} style={styles.reasonChip}>
            <Text style={styles.reasonText}>{reason}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SearchingSkeleton() {
  return (
    <View style={[styles.block, styles.searchingBlock]}>
      <Ionicons name="color-filter-outline" size={22} color={colors.primary} />
      <Text style={styles.searchingText}>Kumaşın görünümü inceleniyor</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  block: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.md,
    marginBottom: spacing.blockGap,
    gap: spacing.sm,
  },
  introTitle: { ...typography.subtitle, color: colors.text },
  introText: { ...typography.body, color: colors.textMuted },
  pickerRow: { gap: spacing.sm, marginTop: spacing.xs },
  pickerButton: { width: '100%' },
  note: { ...typography.caption, color: colors.textMuted },
  previewBlock: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  preview: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.surfaceTonal },
  previewTexts: { flex: 1, minWidth: 0, gap: 2 },
  previewTitle: { ...typography.label, color: colors.text },
  previewMeta: { ...typography.caption, color: colors.textMuted },
  searchingBlock: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchingText: { ...typography.body, color: colors.textMuted },
  banner: { marginHorizontal: spacing.gutter, marginBottom: spacing.blockGap },
  stateBlock: { backgroundColor: colors.surface, marginBottom: spacing.blockGap },
  honestyStrip: {
    ...typography.caption,
    color: colors.textMuted,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sm,
  },
  listBlock: { paddingHorizontal: 0, paddingVertical: 0, gap: 0 },
  againBlock: { paddingVertical: spacing.md },
  resultDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  reasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.gutter,
    paddingBottom: 10,
  },
  similarityBadge: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  similarityText: { fontFamily: fonts.monoSemibold, fontSize: 12, lineHeight: 16, color: colors.primary },
  reasonChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reasonText: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 15, color: colors.textMuted },
});
