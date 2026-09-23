// Profilim + uygulamanın menü merkezi (yeni tasarım, 4. adım — DESIGN.md §3).
//
// Düzen: kimlik kartı (kapak + avatar + ad + başlık + firma) → Deneyim →
// menü (tek tek kutular değil, chevron'lu `ui/ListRow` satırları) → Çıkış.
// Ekranda dolu (primary) düğme YOK; fotoğraf eylemleri kenarlıklı, Çıkış
// `danger`. Veri katmanı ve rota adları değişmedi.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useCallback, useState } from 'react';
import { View, Text, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  MAX_AVATAR_CHARS,
  MAX_COVER_CHARS,
  fetchIncomingConnectionRequests,
  uploadMyAvatar,
  uploadMyCover,
} from '../../api/client';
import { confirmAction } from '../../features/confirm';
import { pickAvatarPhoto, pickCoverPhoto } from '../../features/imagePicker';
import { setCachedUserAvatar, userAvatarKey } from '../../features/users/userAvatarCache';
import { setCachedUserCover, userCoverKey } from '../../features/users/userCoverCache';
import { InlineError } from '../../components/StateView';
import { useSession } from '../../context/SessionContext';
import { useUserProfile } from './useUserProfile';
import { ProfileIdentity } from './ProfileIdentity';
import { ExperienceSection } from './ExperienceSection';
import { useTheme } from '../../theme/ThemeContext';
import { BottomSheet, Button, Icon, ListRow, Screen, SectionTitle, Skeleton, SkeletonRow, type AnyIconName } from '../../ui';

type Props = RootStackScreenProps<'MyProfile'>;

type MenuItem = { key: string; title: string; icon: AnyIconName; onPress: () => void; badge?: number };

export function MyProfileScreen({ navigation }: Props) {
  const t = useTheme();
  const { user, logout, updateUser } = useSession();
  const { profile, loading, error, reload } = useUserProfile(user?.id ?? '');
  const [pendingRequests, setPendingRequests] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // Kapak yüklendikten sonra profil yeniden çekilene kadar geçerli olan değer;
  // undefined = "sunucudan geleni kullan".
  const [coverOverride, setCoverOverride] = useState<string | null | undefined>(undefined);

  const hasPhoto = !!user?.avatarUpdatedAt;
  const coverUpdatedAt = coverOverride !== undefined ? coverOverride : profile?.coverUpdatedAt ?? null;
  const hasCover = !!coverUpdatedAt;

  const photoErrorText = (err: unknown) => {
    const code = err instanceof Error ? err.message : '';
    return code === 'permission_denied'
      ? 'Galeriye erişim izni verilmedi.'
      : code === 'camera_permission_denied'
        ? 'Kameraya erişim izni verilmedi.'
        : code === 'image_too_large'
          ? 'Fotoğraf çok büyük, daha küçük bir fotoğraf deneyin.'
          : 'Fotoğraf yüklenemedi, tekrar deneyin.';
  };

  // Kapak fotoğrafı: avatarla aynı akış (1200 px'e küçült, JPEG, data URL).
  const changeCover = async () => {
    if (!user) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const picked = await pickCoverPhoto('gallery', MAX_COVER_CHARS);
      if (!picked) return;
      const { coverUpdatedAt: next } = await uploadMyCover(picked.dataUrl);
      if (next) setCachedUserCover(userCoverKey(user.id, next), picked.dataUrl);
      setCoverOverride(next);
      reload();
    } catch (err) {
      setPhotoError(photoErrorText(err));
    } finally {
      setPhotoBusy(false);
    }
  };

  const removeCover = async () => {
    const ok = await confirmAction({
      title: 'Kapak fotoğrafını kaldır',
      message: 'Kapak fotoğrafınız kaldırılacak. Yerine düz zemin görünecek.',
      confirmLabel: 'Kaldır',
      destructive: true,
    });
    if (!ok) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      await uploadMyCover(null);
      setCoverOverride(null);
      reload();
    } catch {
      setPhotoError('Kapak fotoğrafı kaldırılamadı, tekrar deneyin.');
    } finally {
      setPhotoBusy(false);
    }
  };

  // Fotoğrafı seç/çek → 512 px kareye küçült → sunucuya yükle. Başarılı olunca
  // oturumdaki kullanıcı güncellenir (üst çubuktaki avatar anında değişsin) ve
  // yeni fotoğraf önbelleğe konur (aynı fotoğraf için ikinci istek gitmesin).
  const changePhoto = async (source: 'camera' | 'gallery') => {
    if (!user) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const picked = await pickAvatarPhoto(source, MAX_AVATAR_CHARS);
      if (!picked) return;
      const { avatarUpdatedAt } = await uploadMyAvatar(picked.dataUrl);
      if (avatarUpdatedAt) setCachedUserAvatar(userAvatarKey(user.id, avatarUpdatedAt), picked.dataUrl);
      updateUser({ avatarUpdatedAt });
    } catch (err) {
      setPhotoError(photoErrorText(err));
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    if (!user) return;
    const ok = await confirmAction({
      title: 'Fotoğrafı kaldır',
      message: 'Profil fotoğrafınız kaldırılacak. Yerine baş harfleriniz görünecek.',
      confirmLabel: 'Kaldır',
      destructive: true,
    });
    if (!ok) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      await uploadMyAvatar(null);
      updateUser({ avatarUpdatedAt: null });
    } catch {
      setPhotoError('Fotoğraf kaldırılamadı, tekrar deneyin.');
    } finally {
      setPhotoBusy(false);
    }
  };

  // Fotoğraf eylemleri (Fırat 2026-09-23): düğmeler yerine kalem simgeleri; avatarın ve
  // kapağın kalemi kendi seçeneklerini alt sayfada açar.
  const [sheet, setSheet] = useState<null | 'avatar' | 'cover'>(null);
  const closeThen = (fn: () => void) => () => {
    setSheet(null);
    fn();
  };
  const photoActions = !photoBusy && !photoError ? null : (
    <View style={{ gap: t.space[2] }}>
      {photoBusy ? (
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>Fotoğraf yükleniyor…</Text>
      ) : null}
      {photoError ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minWidth: 0 }}>
          <Icon name="warning" size={t.size.iconSm} color="danger" />
          <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{photoError}</Text>
        </View>
      ) : null}
    </View>
  );

  // Zil ortak ana başlıkta (components/MainHeader); bu ekran yığına taşındığı
  // için kendi başlığında ayrıca gösterilmiyor.

  // "Bağlantı İstekleri" satırında bekleyen istek sayısı rozeti var.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchIncomingConnectionRequests()
        .then(({ requests }) => {
          if (!cancelled) setPendingRequests(requests.length);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const menu = [
    user?.companyId
      ? { key: 'company', title: 'Firmam', icon: 'business-outline' as AnyIconName, onPress: () => navigation.navigate('CompanyProfile') }
      : null,
    user?.companyId
      ? { key: 'assistantReport', title: 'Asistan raporu', icon: 'stats-chart-outline' as AnyIconName, onPress: () => navigation.navigate('AssistantReport') }
      : null,
    { key: 'sampleRequests', title: 'Taleplerim', icon: 'sample' as AnyIconName, onPress: () => navigation.navigate('MySampleRequests') },
    // Faz 2, Adım 2: teklif istekleri (verdiğim + firmama gelen).
    { key: 'quoteRequests', title: 'Tekliflerim', icon: 'quote' as AnyIconName, onPress: () => navigation.navigate('QuoteRequests') },
    // Faz 3, Adım 4: kabul edilen tekliften doğan sipariş kayıtları.
    { key: 'deals', title: 'Siparişlerim', icon: 'cart-outline' as AnyIconName, onPress: () => navigation.navigate('Deals') },
    { key: 'favorites', title: 'Takip Ettiklerim', icon: 'heart' as AnyIconName, onPress: () => navigation.navigate('FavoriteProducts') },
    // 2026-09-22 menü temizliği: İplik Dizini (Ürünler sekmesindeki "İplik"),
    // Fotoğrafla Kumaş Ara ve Fason Kapasite Ara (Ürünler sekmesindeki araç
    // düğmeleri) ile Makine Parkım (firma sayfasındaki "Makine parkı") buradan
    // kaldırıldı — hepsine kendi bağlamlarından erişiliyor.
    // Faz 2, Adım 1: izleme kuralları ("bu kalitede ürün çıkınca haber ver").
    { key: 'watchRules', title: 'İzlediklerim', icon: 'eye-outline' as AnyIconName, onPress: () => navigation.navigate('WatchRules') },
    { key: 'recentlyViewed', title: 'Son Baktıklarım', icon: 'clock' as AnyIconName, onPress: () => navigation.navigate('RecentlyViewedProducts') },
    { key: 'feedMutes', title: 'Gizlediğim Firmalar', icon: 'eye-off-outline' as AnyIconName, onPress: () => navigation.navigate('FeedMutes') },
    { key: 'connections', title: 'Bağlantılarım', icon: 'people-outline' as AnyIconName, onPress: () => navigation.navigate('Connections') },
    // Faz 2, Adım 4: tedarikçi/müşteri daveti (hazır metin, WhatsApp'tan paylaşılır).
    { key: 'invites', title: 'Davet Et', icon: 'share' as AnyIconName, onPress: () => navigation.navigate('Invites') },
    {
      key: 'connectionRequests',
      title: 'Bağlantı İstekleri',
      icon: 'person-add-outline' as AnyIconName,
      onPress: () => navigation.navigate('ConnectionRequests'),
      badge: pendingRequests,
    },
    user?.isAdmin
      ? { key: 'admin', title: 'Yönetim (doğrulama, şikâyetler)', icon: 'shield-checkmark-outline' as AnyIconName, onPress: () => navigation.navigate('Admin') }
      : null,
  ].filter((item): item is MenuItem => item !== null);

  return (
    <Screen>
      <BottomSheet visible={sheet === 'avatar'} onClose={() => setSheet(null)} title="Profil fotoğrafı">
        <ListRow left={<Icon name="image-outline" color="brand" />} title={hasPhoto ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle'} onPress={closeThen(() => changePhoto('gallery'))} />
        {/* Web'de tarayıcı kamerası yok (bkz. features/imagePicker). */}
        {Platform.OS !== 'web' ? (
          <ListRow left={<Icon name="camera" color="brand" />} title="Fotoğraf çek" onPress={closeThen(() => changePhoto('camera'))} />
        ) : null}
        {hasPhoto ? (
          <ListRow left={<Icon name="trash-outline" color="danger" />} title="Fotoğrafı kaldır" divider={false} onPress={closeThen(removePhoto)} />
        ) : null}
      </BottomSheet>
      <BottomSheet visible={sheet === 'cover'} onClose={() => setSheet(null)} title="Kapak fotoğrafı">
        <ListRow left={<Icon name="image-outline" color="brand" />} title={hasCover ? 'Kapağı değiştir' : 'Kapak ekle'} divider={hasCover} onPress={closeThen(changeCover)} />
        {hasCover ? (
          <ListRow left={<Icon name="trash-outline" color="danger" />} title="Kapağı kaldır" divider={false} onPress={closeThen(removeCover)} />
        ) : null}
      </BottomSheet>
      {/* Menü, profil yüklenirken ya da yüklenemese de hep erişilebilir
          (özellikle Çıkış): eskiden yükleme sürerken ekran tamamen boştu. */}
      {loading ? (
        <View style={{ gap: t.space[4] }}>
          <Skeleton height={t.size.toolBox + t.size.thumb} />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : profile ? (
        <>
          <ProfileIdentity
            profile={profile}
            avatarUpdatedAt={user?.avatarUpdatedAt ?? null}
            belowIdentity={photoActions}
            isSelf
            coverUpdatedAt={coverUpdatedAt}
            onEditCover={() => setSheet('cover')}
            onEditAvatar={() => setSheet('avatar')}
            onEditProfile={() =>
              navigation.navigate('ProfileEdit', {
                headline: profile.headline,
                location: profile.location,
                about: profile.about,
              })
            }
            onOpenConnections={() => navigation.navigate('Connections')}
            onOpenCompany={(companyId) => navigation.navigate('CompanyProfile', { companyId })}
          />
          <ExperienceSection
            experiences={profile.experiences ?? []}
            isSelf
            onAdd={() => navigation.navigate('ExperienceForm')}
            onEdit={(experience) => navigation.navigate('ExperienceForm', { experience })}
          />
        </>
      ) : (
        <InlineError message={error ?? 'Profil alınamadı'} onRetry={reload} />
      )}

      <View style={{ gap: t.space[3], minWidth: 0 }}>
        <SectionTitle title="Kısayollar" />
        <View
          style={{
            backgroundColor: t.colors.surface1,
            borderWidth: 1,
            borderColor: t.colors.line,
            borderRadius: t.radius.lg,
            paddingHorizontal: t.space[4],
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          {menu.map((item, index) => (
            <ListRow
              key={item.key}
              title={item.title}
              left={<MenuIcon name={item.icon} />}
              divider={index < menu.length - 1}
              onPress={item.onPress}
              unread={!!item.badge}
              unreadCount={item.badge}
            />
          ))}
        </View>
      </View>

      {/* Çıkışta gezinme çağrısı yok: user null olunca RootNavigator zaten
          giriş ekranlarına geçiyor. */}
      <Button kind="danger" fullWidth icon="log-out-outline" label="Çıkış yap" onPress={logout} />
    </Screen>
  );
}

// Menü satırının solundaki 40px ikon karesi (liste satırı avatarıyla aynı ölçü).
function MenuIcon({ name }: { name: AnyIconName }) {
  const t = useTheme();
  return (
    <View
      style={{
        width: t.size.avatar,
        height: t.size.avatar,
        borderRadius: t.radius.md,
        backgroundColor: t.colors.brandSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={name} size={t.size.iconSm} color="brand" />
    </View>
  );
}
