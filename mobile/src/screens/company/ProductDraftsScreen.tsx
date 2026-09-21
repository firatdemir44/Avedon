import React, { useState } from 'react';
import { View, Text, FlatList, Platform, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import { dismissProductDraft, fetchProductDrafts, type ProductDraftSummary } from '../../api/client';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { useFocusLoad } from '../../features/useFocusLoad';
import { SUBTYPES, TYPE_LABELS, type ProductType } from '../../features/products/catalog';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { formatRelativeTime } from '../../features/time';
import { colors, fonts, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'ProductDrafts'>;

// WhatsApp'taki Avedon asistanına gönderilen etiket fotoğrafından hazırlanan,
// henüz ürüne çevrilmemiş taslaklar. Satıra dokununca ürün formu taslakla
// açılır (onay ekranı → forma aktarım); ürün kaydedilince taslak listeden
// düşer. Satırın kendisi ve "Sil" düğmesi KARDEŞ dokunma alanları: web'de iç
// içe <button> oluşmasın.
export function ProductDraftsScreen({ navigation }: Props) {
  const { data, setData, status, error, refreshing, reload, refresh } = useFocusLoad(fetchProductDrafts);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const drafts = data?.drafts ?? [];

  const remove = async (draft: ProductDraftSummary) => {
    const confirmed = await confirmAction({
      title: 'Taslağı sil',
      message: `${draft.code || 'Kodsuz taslak'} silinsin mi?`,
      confirmLabel: 'Sil',
      destructive: true,
    });
    if (!confirmed) return;
    setBusyId(draft.id);
    setActionError(null);
    try {
      await dismissProductDraft(draft.id);
      haptics.success();
      setData((prev) => (prev ? { drafts: prev.drafts.filter((d) => d.id !== draft.id) } : prev));
    } catch {
      haptics.error();
      setActionError('Taslak silinemedi, lütfen tekrar deneyin.');
    } finally {
      setBusyId(null);
    }
  };

  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        <SkeletonList variant="conversation" />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.screen}>
        <ErrorState error={error} fallback="Taslaklar alınamadı" onRetry={reload} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {actionError ? <InlineError message={actionError} style={styles.banner} /> : null}
      <FlatList
        data={drafts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={refreshControl(refreshing, refresh)}
        ListHeaderComponent={
          drafts.length ? (
            <Text style={styles.intro}>
              Taslak henüz ürün değil: açıp kontrol edin, fiyat ve stoğu siz girin, sonra kaydedin.
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="logo-whatsapp"
            title="Bekleyen taslak yok"
            message="WhatsApp'tan Avedon asistanına bir etiket fotoğrafı gönderin; taslağı burada hazır bulursunuz."
          />
        }
        renderItem={({ item, index }) => {
          const title = item.code || 'Kodsuz taslak';
          const subtitle = subtitleFor(item);
          return (
            <View style={[styles.row, index < drafts.length - 1 && styles.rowDivider]}>
              <Pressable
                onPress={() => navigation.navigate('AddProduct', { draftId: item.id })}
                accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
                accessibilityLabel={`${title}, ${formatRelativeTime(item.createdAt)}, taslağı aç`}
                style={({ pressed }) => [styles.open, pressed && styles.pressed]}
              >
                <Ionicons name="logo-whatsapp" size={22} color={colors.primary} />
                <View style={styles.texts}>
                  <Text style={styles.title} numberOfLines={1}>
                    {title}
                  </Text>
                  {subtitle ? (
                    <Text style={styles.subtitle} numberOfLines={2}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.time}>{formatRelativeTime(item.createdAt)}</Text>
              </Pressable>
              <Pressable
                onPress={() => remove(item)}
                disabled={busyId === item.id}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`${title} taslağını sil`}
                style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
              >
                <Text style={styles.removeText}>{busyId === item.id ? '…' : 'Sil'}</Text>
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}

// Alt satır: çeşit / alt çeşit etiketi ve WhatsApp mesajındaki not.
function subtitleFor(draft: ProductDraftSummary) {
  const parts: string[] = [];
  const typeLabel = draft.type ? TYPE_LABELS[draft.type as ProductType] : undefined;
  if (typeLabel) {
    const subtypeLabel = draft.subtype
      ? SUBTYPES[draft.type as ProductType]?.find((s) => s.key === draft.subtype)?.label
      : undefined;
    parts.push(subtypeLabel ? `${typeLabel} · ${subtypeLabel}` : typeLabel);
  }
  if (draft.caption.trim()) parts.push(draft.caption.trim());
  return parts.length ? parts.join(' · ') : undefined;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  banner: { margin: spacing.gutter },
  intro: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingRight: spacing.gutter,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  open: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
  },
  pressed: { backgroundColor: colors.pressed },
  texts: { flex: 1, gap: 2 },
  title: { ...typography.body, fontFamily: fonts.semibold, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textMuted },
  time: { ...typography.mono, fontSize: 13, lineHeight: 17, color: colors.textMuted },
  remove: { paddingLeft: spacing.sm, paddingVertical: spacing.sm },
  removeText: { ...typography.caption, fontFamily: fonts.semibold, color: colors.danger },
});
