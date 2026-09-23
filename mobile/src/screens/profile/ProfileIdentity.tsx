// Kimlik başlığı (yeni tasarım, 4. adım — DESIGN.md §3 "Kart" + §5).
//
// Kapak fotoğrafı, kapağa taşan büyük yuvarlak avatar, ad · başlık · firma
// (doğrulanmış rozetiyle) · konum · bağlantı sayısı, sonra Hakkında ve telefon.
// Profilim ekranı ve başkasının profil ekranı ortak kullanır.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import type { PublicUserProfile } from '../../api/client';
import { UserAvatar } from '../../components/UserAvatar';
import { getCachedUserCover, loadUserCover, userCoverKey } from '../../features/users/userCoverCache';
import { useTheme } from '../../theme/ThemeContext';
import { Badge, Icon } from '../../ui';

interface Props {
  profile: PublicUserProfile;
  onOpenCompany?: (companyId: string) => void;
  // Profilim ekranında büyük avatar ve altında fotoğraf düğmeleri var.
  avatarSize?: number;
  // Oturumdaki değerle anında tazelemek için (fotoğraf yükledikten sonra
  // profil yeniden çekilmeden önce); verilmezse profildeki değer kullanılır.
  avatarUpdatedAt?: string | null;
  // Kimlik satırının altına eklenen bölüm ("Fotoğrafı değiştir" vb.).
  belowIdentity?: React.ReactNode;
  // Kendi profilim: kapak/başlık düzenleme düğmeleri yalnızca burada çıkar.
  isSelf?: boolean;
  // Kapak yüklendikten sonra profil yeniden çekilmeden tazelemek için.
  coverUpdatedAt?: string | null;
  onEditCover?: () => void;
  // Kendi profilim: avatarın köşesindeki kalem, fotoğraf seçeneklerini açar.
  onEditAvatar?: () => void;
  onEditProfile?: () => void;
  onOpenConnections?: () => void;
}

export function ProfileIdentity({
  profile,
  onOpenCompany,
  avatarSize,
  avatarUpdatedAt,
  belowIdentity,
  isSelf = false,
  coverUpdatedAt,
  onEditCover,
  onEditAvatar,
  onEditProfile,
  onOpenConnections,
}: Props) {
  const t = useTheme();
  // Varsayılan avatar: ürün görseli (72) + bir ızgara adımı = 88, ham px yok.
  const avatar = avatarSize ?? t.size.thumb + t.space[4];
  const name = `${profile.firstName} ${profile.lastName}`;
  const company = profile.company;
  // Başlık boşsa unvan ve firma adından otomatik kurulur.
  const headline =
    profile.headline?.trim() ||
    [profile.position?.trim(), company?.name?.trim()].filter(Boolean).join(' · ');
  const about = profile.about?.trim() ?? '';
  const cover = coverUpdatedAt !== undefined ? coverUpdatedAt : profile.coverUpdatedAt;

  // Bölümleri ayıran tam genişlik çizgi (kartın kendi iç boşluğu yok).
  const divider = { borderTopWidth: 1, borderTopColor: t.colors.line } as const;

  return (
    <View
      style={{
        backgroundColor: t.colors.surface1,
        borderWidth: 1,
        borderColor: t.colors.line,
        borderRadius: t.radius.lg,
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      <View>
        <ProfileCover userId={profile.id} coverUpdatedAt={cover} />
        {isSelf && onEditCover ? (
          <Pressable
            onPress={onEditCover}
            accessibilityRole="button"
            accessibilityLabel="Kapak fotoğrafını değiştir"
            style={({ pressed }) => ({
              position: 'absolute',
              top: t.space[2],
              right: t.space[2],
              width: t.size.touchMin,
              height: t.size.touchMin,
              borderRadius: t.radius.full,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: t.colors.line,
              backgroundColor: pressed ? t.colors.surface2 : t.colors.surface1,
            })}
          >
            <Icon name="create-outline" size={t.size.iconSm} color="brand" />
          </Pressable>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: t.space[4], paddingBottom: t.space[4], minWidth: 0 }}>
        <View style={{ alignSelf: 'flex-start', marginTop: -(avatar / 2), marginBottom: t.space[2] }}>
        <View
          style={{
            borderRadius: t.radius.full,
            borderWidth: t.space[1] / 2,
            borderColor: t.colors.surface1,
            backgroundColor: t.colors.surface1,
            overflow: 'hidden',
          }}
        >
          {/* Kişi sayfası: kişinin kendi fotoğrafı (yoksa baş harfleri). */}
          <UserAvatar
            userId={profile.id}
            firstName={profile.firstName}
            lastName={profile.lastName}
            avatarUpdatedAt={avatarUpdatedAt !== undefined ? avatarUpdatedAt : profile.avatarUpdatedAt}
            size={avatar}
          />
        </View>
        {isSelf && onEditAvatar ? (
          <Pressable
            onPress={onEditAvatar}
            accessibilityRole="button"
            accessibilityLabel="Profil fotoğrafını düzenle"
            style={({ pressed }) => ({
              position: 'absolute',
              right: -t.space[3],
              bottom: -t.space[1],
              width: t.size.touchMin,
              height: t.size.touchMin,
              borderRadius: t.radius.full,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: t.colors.line,
              backgroundColor: pressed ? t.colors.surface2 : t.colors.surface1,
            })}
          >
            <Icon name="create-outline" size={t.size.iconSm} color="brand" />
          </Pressable>
        ) : null}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minWidth: 0 }}>
          <Text
            accessibilityRole="header"
            numberOfLines={2}
            style={[t.type.title22, { color: t.colors.ink, flex: 1, minWidth: 0 }]}
          >
            {name}
          </Text>
          {isSelf && onEditProfile ? (
            <Pressable
              onPress={onEditProfile}
              accessibilityRole="button"
              accessibilityLabel="Profil bilgilerini düzenle"
              style={({ pressed }) => ({
                width: t.size.touchMin,
                height: t.size.touchMin,
                borderRadius: t.radius.full,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? t.colors.surface2 : 'transparent',
              })}
            >
              <Icon name="create-outline" size={t.size.iconSm} color="brand" />
            </Pressable>
          ) : null}
        </View>

        {headline ? (
          <Text style={[t.type.body16, { color: t.colors.ink, marginTop: t.space[1] }]}>{headline}</Text>
        ) : null}

        {company ? (
          <Pressable
            onPress={() => onOpenCompany?.(company.id)}
            disabled={!onOpenCompany}
            accessibilityRole={onOpenCompany ? 'button' : undefined}
            accessibilityLabel={onOpenCompany ? `${company.name}, firma sayfasını aç` : company.name}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.space[2],
              alignSelf: 'flex-start',
              minHeight: t.size.touchMin,
              minWidth: 0,
              opacity: pressed && onOpenCompany ? 0.6 : 1,
            })}
          >
            <Text numberOfLines={1} style={[t.type.label14, { color: t.colors.brand, flexShrink: 1 }]}>
              {company.name}
            </Text>
            {/* Durum yalnız renkle verilmez: rozet ikon + metin (DESIGN.md §6). */}
            {company.verification === 'dogrulanmis' ? <Badge kind="verified" /> : null}
          </Pressable>
        ) : null}

        {profile.location?.trim() ? (
          <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{profile.location.trim()}</Text>
        ) : null}

        <Pressable
          onPress={onOpenConnections}
          disabled={!onOpenConnections}
          accessibilityRole={onOpenConnections ? 'button' : undefined}
          accessibilityLabel={`${profile.connectionCount ?? 0} bağlantı`}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            minHeight: t.size.touchMin,
            justifyContent: 'center',
            opacity: pressed && onOpenConnections ? 0.6 : 1,
          })}
        >
          <Text style={[t.type.label14, { color: t.colors.brand }]}>
            {profile.connectionCount ?? 0} bağlantı
          </Text>
        </Pressable>
      </View>

      {belowIdentity ? (
        <View style={{ paddingHorizontal: t.space[4], paddingBottom: t.space[4] }}>{belowIdentity}</View>
      ) : null}

      {about ? (
        <View style={[divider, { padding: t.space[4], gap: t.space[2] }]}>
          <Text accessibilityRole="header" style={[t.type.title18, { color: t.colors.ink }]}>
            Hakkında
          </Text>
          <Text style={[t.type.body16, { color: t.colors.ink }]}>{about}</Text>
        </View>
      ) : isSelf && onEditProfile ? (
        <Pressable
          onPress={onEditProfile}
          accessibilityRole="button"
          accessibilityLabel="Hakkında ekle"
          style={({ pressed }) => [
            divider,
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.space[2],
              minHeight: t.size.touchMin,
              paddingHorizontal: t.space[4],
              backgroundColor: pressed ? t.colors.surface2 : 'transparent',
            },
          ]}
        >
          <Icon name="plus" size={t.size.iconSm} color="brand" />
          <Text style={[t.type.label14, { color: t.colors.brand }]}>Hakkında ekle</Text>
        </Pressable>
      ) : null}

      <View
        style={[
          divider,
          {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: t.space[3],
            minHeight: t.size.control,
            paddingHorizontal: t.space[4],
            minWidth: 0,
          },
        ]}
      >
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>Telefon</Text>
        {/* Sunucu, bağlantı yoksa telefon alanını hiç göndermiyor. */}
        {profile.phone ? (
          <Text selectable numberOfLines={1} style={[t.type.mono14, { color: t.colors.ink, flexShrink: 1 }]}>
            {profile.phone}
          </Text>
        ) : (
          <Text numberOfLines={1} style={[t.type.body14, { color: t.colors.ink3, flexShrink: 1 }]}>
            Bağlantı kurunca görünür
          </Text>
        )}
      </View>
    </View>
  );
}

// Kapak fotoğrafı: avatarla aynı önbellek deseni; yoksa düz tonlu zemin.
function ProfileCover({ userId, coverUpdatedAt }: { userId: string; coverUpdatedAt?: string | null }) {
  const t = useTheme();
  const key = coverUpdatedAt ? userCoverKey(userId, coverUpdatedAt) : null;
  const [photo, setPhoto] = useState<string | null>(() => (key ? getCachedUserCover(key) ?? null : null));

  useEffect(() => {
    if (!key) {
      setPhoto(null);
      return;
    }
    const cached = getCachedUserCover(key);
    if (cached) {
      setPhoto(cached);
      return;
    }
    let cancelled = false;
    setPhoto(null);
    loadUserCover(key)
      .then((url) => {
        if (!cancelled) setPhoto(url);
      })
      .catch(() => {
        // Kapak gelmezse düz zemin kalır.
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  // 16:6 şerit, tam genişlik. Yükseklik oranla hesaplanır (web'de de çalışır).
  const box = { width: '100%', aspectRatio: 16 / 6 } as const;

  if (photo) {
    return (
      <Image
        source={{ uri: photo }}
        style={[box, { backgroundColor: t.colors.surface2 }]}
        resizeMode="cover"
        accessibilityLabel="Kapak fotoğrafı"
      />
    );
  }
  return (
    <View
      style={[
        box,
        { backgroundColor: t.colors.surface2, borderBottomWidth: 1, borderBottomColor: t.colors.line },
      ]}
    />
  );
}
