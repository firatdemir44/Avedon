// Yönetici ekranı (yeni tasarım, 4. adım — DESIGN.md §2, §3).
//
// Veri katmanı DEĞİŞMEDİ: aynı uçlar (fetchAdminCompanies /
// updateCompanyVerification), aynı yetki kontrolü, aynı alt bileşen
// (AdminVerificationRequests). Yalnızca görünüm yeni: sekme şeridi
// `ui/SegmentControl`, firma kutuları `ui/Card`, durum seçimi `ui/ChipRow`.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../../context/SessionContext';
import { fetchAdminCompanies, updateCompanyVerification } from '../../api/client';
import { AdminVerificationRequests } from './AdminVerificationRequests';
import { friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { useFocusLoad } from '../../features/useFocusLoad';
import { useTheme } from '../../theme/ThemeContext';
import {
  Badge,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  Icon,
  SegmentControl,
  SkeletonRow,
} from '../../ui';
import type { VerificationStatus } from '../../types';

const STATUS_OPTIONS: { value: VerificationStatus; label: string }[] = [
  { value: 'dogrulanmamis', label: 'Doğrulanmamış' },
  { value: 'inceleniyor', label: 'İnceleniyor' },
  { value: 'dogrulanmis', label: 'Doğrulandı' },
];

// Doğrulamanın nasıl yapıldığı (Faz 2, Adım 7): firma sayfasındaki rozet
// açıklamasında görünür.
type VerificationLevel = 'belge' | 'ziyaret';

const LEVEL_OPTIONS: { value: VerificationLevel; label: string }[] = [
  { value: 'belge', label: 'Belge ile' },
  { value: 'ziyaret', label: 'Yerinde ziyaretle' },
];

function levelLabel(level?: string): string {
  return LEVEL_OPTIONS.find((o) => o.value === level)?.label ?? 'Düzey belirtilmemiş';
}

// Firma durumu → rozet (ikon + metin; yalnız renk değil).
function statusBadge(status: VerificationStatus) {
  if (status === 'dogrulanmis') return { kind: 'verified' as const, label: 'Doğrulandı' };
  if (status === 'inceleniyor') return { kind: 'pending' as const, label: 'İnceleniyor' };
  return { kind: 'cancelled' as const, label: 'Doğrulanmamış' };
}

type Tab = 'requests' | 'companies';

/**
 * Yönetici ekranı ("Firma Doğrulama"). İki sekme: gelen doğrulama başvuruları
 * (karar verilen yer) ve firma listesinde elle durum değiştirme (eskiden beri
 * duran yol, kaldırılmadı). Ekran yalnızca `user.isAdmin` olanlara açılır;
 * yöneticinin kim olduğu firmaya hiçbir yerde gösterilmez.
 */
export function AdminScreen() {
  const t = useTheme();
  const { user } = useSession();
  const isAdmin = !!user?.isAdmin;
  const [tab, setTab] = useState<Tab>('requests');
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  if (!isAdmin) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.surface0 }} edges={['bottom']}>
        <EmptyState
          icon="lock-closed-outline"
          title="Erişim yetkiniz yok"
          description="Bu ekran yalnızca Avedon ekibine açık."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.surface0 }} edges={['bottom']}>
      <View style={{ paddingHorizontal: t.space[4], paddingTop: t.space[4], paddingBottom: t.space[3] }}>
        <SegmentControl<Tab>
          stretch
          accessibilityLabel="Yönetici bölümü"
          value={tab}
          onChange={setTab}
          options={[
            {
              value: 'requests',
              label: pendingCount === null ? 'Başvurular' : `Başvurular (${pendingCount})`,
            },
            { value: 'companies', label: 'Firmalar' },
          ]}
        />
      </View>
      {tab === 'requests' ? (
        <AdminVerificationRequests onPendingCount={setPendingCount} />
      ) : (
        <AdminCompanies />
      )}
    </SafeAreaView>
  );
}

// Firma listesi + elle durum değiştirme (veri akışı eski ekranın aynısı).
function AdminCompanies() {
  const t = useTheme();
  const { user } = useSession();
  const isAdmin = !!user?.isAdmin;
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(
    () => fetchAdminCompanies().then(({ companies }) => companies),
    { enabled: isAdmin }
  );
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleSetStatus = async (
    companyId: string,
    nextStatus: VerificationStatus,
    level?: VerificationLevel
  ) => {
    if (!isAdmin) return;
    setUpdatingId(companyId);
    setActionError(null);
    try {
      // "Doğrulandı" düzeysiz gönderilmez: varsayılan "Belge ile".
      await updateCompanyVerification(
        companyId,
        nextStatus,
        nextStatus === 'dogrulanmis' ? (level ?? 'belge') : undefined
      );
      await reload();
    } catch (err) {
      setActionError(friendlyMessage(err, 'Durum güncellenemedi'));
    } finally {
      setUpdatingId(null);
    }
  };

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, paddingHorizontal: t.space[4], gap: t.space[4] }}>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={{ flex: 1 }}>
        <EmptyState
          icon="warning"
          title="Firmalar alınamadı"
          description={friendlyMessage(error, 'Bağlantıyı kontrol edip tekrar deneyin.')}
          actionLabel="Tekrar dene"
          onAction={reload}
        />
      </View>
    );
  }

  const bannerMessage = actionError ?? (error ? friendlyMessage(error, 'Firmalar alınamadı') : null);

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: t.space[4], paddingBottom: t.space[10], gap: t.space[4] }}
        refreshControl={refreshControl(refreshing, refresh)}
        ListHeaderComponent={
          bannerMessage ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.space[2],
                padding: t.space[3],
                borderRadius: t.radius.md,
                backgroundColor: t.colors.dangerSoft,
                minWidth: 0,
              }}
            >
              <Icon name="warning" size={t.size.iconSm} color="danger" />
              <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>
                {bannerMessage}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={<EmptyState icon="business-outline" title="Henüz firma yok" />}
        renderItem={({ item }) => {
          const badge = statusBadge(item.verification);
          const busy = updatingId === item.id;
          return (
            <Card>
              <View style={{ gap: t.space[3], minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minWidth: 0 }}>
                  <Text
                    numberOfLines={2}
                    style={[t.type.title18, { color: t.colors.ink, flex: 1, minWidth: 0 }]}
                  >
                    {item.name}
                  </Text>
                  <Badge kind={badge.kind} label={badge.label} />
                </View>

                <View style={{ gap: t.space[1] / 2, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[t.type.body14, { color: t.colors.ink2 }]}>
                    Vergi No: {item.taxId}
                  </Text>
                  <Text numberOfLines={1} style={[t.type.body14, { color: t.colors.ink2 }]}>
                    Şirket Kodu: {item.companyCode}
                  </Text>
                  <Text numberOfLines={1} style={[t.type.body14, { color: t.colors.ink2 }]}>
                    {item._count.users} çalışan · {item._count.products} ürün
                  </Text>
                </View>

                {/* Durum seçimi: çip satırı (seçili çip zaten "şu anki durum"). */}
                <View style={{ gap: t.space[2], minWidth: 0 }}>
                  <Text style={[t.type.label14, { color: t.colors.ink2 }]}>Durum</Text>
                  <ChipRow>
                    {STATUS_OPTIONS.map((option) => {
                      const isCurrent = item.verification === option.value;
                      return (
                        <Chip
                          key={option.value}
                          label={option.label}
                          selected={isCurrent}
                          disabled={isCurrent || busy}
                          onPress={() => handleSetStatus(item.id, option.value)}
                        />
                      );
                    })}
                  </ChipRow>
                </View>

                {item.verification === 'dogrulanmis' ? (
                  <View style={{ gap: t.space[2], minWidth: 0 }}>
                    <Text style={[t.type.label14, { color: t.colors.ink2 }]}>
                      Doğrulama düzeyi: {levelLabel(item.verificationLevel)}
                    </Text>
                    <ChipRow>
                      {LEVEL_OPTIONS.map((option) => {
                        const isCurrent = item.verificationLevel === option.value;
                        return (
                          <Chip
                            key={option.value}
                            label={option.label}
                            selected={isCurrent}
                            disabled={isCurrent || busy}
                            onPress={() => handleSetStatus(item.id, 'dogrulanmis', option.value)}
                          />
                        );
                      })}
                    </ChipRow>
                  </View>
                ) : null}
              </View>
            </Card>
          );
        }}
      />
    </View>
  );
}
