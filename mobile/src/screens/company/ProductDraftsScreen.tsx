// WhatsApp taslakları (yeni tasarım, 4. adım — DESIGN.md §2/§3).
//
// WhatsApp'taki Avedon asistanına gönderilen etiket fotoğrafından hazırlanan,
// henüz ürüne çevrilmemiş taslaklar. Satıra dokununca ürün formu taslakla
// açılır (onay ekranı → forma aktarım); ürün kaydedilince taslak listeden
// düşer. "Sil" eylemi satırın ALTINDA ayrı bir düğme (iç içe düğme olmaz).
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useEffect, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { dismissProductDraft, fetchProductDrafts, type ProductDraftSummary } from '../../api/client';
import { ErrorState } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { useFocusLoad } from '../../features/useFocusLoad';
import { SUBTYPES, TYPE_LABELS, type ProductType } from '../../features/products/catalog';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { formatRelativeTime } from '../../features/time';
import { useTheme } from '../../theme/ThemeContext';
import { useBottomPadding, AppBar, Button, EmptyState, Icon, ListRow, Screen, SkeletonRow } from '../../ui';

type Props = RootStackScreenProps<'ProductDrafts'>;

export function ProductDraftsScreen({ navigation }: Props) {
  const t = useTheme();
  const bottomPad = useBottomPadding();
  const { data, setData, status, error, refreshing, reload, refresh } = useFocusLoad(fetchProductDrafts);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

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

  const header = (
    <View style={{ gap: t.space[3], paddingBottom: t.space[3] }}>
      {drafts.length ? (
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
          Taslak henüz ürün değil: açıp kontrol edin, fiyat ve stoğu siz girin, sonra kaydedin.
        </Text>
      ) : null}
      {actionError ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.space[2],
            padding: t.space[3],
            borderRadius: t.radius.md,
            backgroundColor: t.colors.dangerSoft,
          }}
        >
          <Icon name="warning" size={t.size.iconSm} color="danger" />
          <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{actionError}</Text>
        </View>
      ) : null}
    </View>
  );

  const whatsappIcon = (
    <View
      style={{
        width: t.size.avatar,
        height: t.size.avatar,
        borderRadius: t.radius.sm,
        backgroundColor: t.colors.brandSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="whatsapp" color="brand" />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title="WhatsApp taslakları" leading="back" onBack={() => navigation.goBack()} />
      <Screen scroll={false} noPadding>
        {status === 'loading' ? (
          <View style={{ paddingHorizontal: t.space[4], gap: t.space[4] }}>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : status === 'error' ? (
          <ErrorState error={error} fallback="Taslaklar alınamadı" onRetry={reload} />
        ) : (
          <FlatList
            data={drafts}
            keyExtractor={(item) => item.id}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: bottomPad }}
            refreshControl={refreshControl(refreshing, refresh)}
            ListHeaderComponent={header}
            ListEmptyComponent={
              <EmptyState
                icon="whatsapp"
                title="Bekleyen taslak yok"
                description="WhatsApp'tan Avedon asistanına bir etiket fotoğrafı gönderin; taslağı burada hazır bulursunuz."
              />
            }
            renderItem={({ item, index }) => {
              const title = item.code || 'Kodsuz taslak';
              const subtitle = subtitleFor(item);
              const last = index === drafts.length - 1;
              return (
                <View>
                  <ListRow
                    title={title}
                    subtitle={subtitle}
                    left={whatsappIcon}
                    time={formatRelativeTime(item.createdAt)}
                    divider={false}
                    onPress={() => navigation.navigate('AddProduct', { draftId: item.id })}
                  />
                  {/* Sil: satırın İÇİNDE değil ALTINDA (iç içe düğme olmaz). */}
                  <View
                    style={{
                      paddingBottom: t.space[3],
                      borderBottomWidth: last ? 0 : 1,
                      borderBottomColor: t.colors.line,
                      marginBottom: last ? 0 : t.space[3],
                    }}
                  >
                    <Button
                      kind="danger"
                      label="Taslağı sil"
                      accessibilityLabel={`${title} taslağını sil`}
                      loading={busyId === item.id}
                      onPress={() => remove(item)}
                    />
                  </View>
                </View>
              );
            }}
          />
        )}
      </Screen>
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
