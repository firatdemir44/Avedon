import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PublicUserProfile } from '../../api/client';
import { UserAvatar } from '../../components/UserAvatar';
import { getCachedUserCover, loadUserCover, userCoverKey } from '../../features/users/userCoverCache';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

interface Props {
  profile: PublicUserProfile;
  onOpenCompany?: (companyId: string) => void;
  // Profilim ekranında büyük avatar (88) ve altında fotoğraf düğmeleri var.
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
  onEditProfile?: () => void;
  onOpenConnections?: () => void;
}

// Taslak: docs/tasarim-yonleri/CProfil.dc.html + LinkedIn benzeri başlık
// (Fırat, 2026-09-22): kapak fotoğrafı, kapağa taşan büyük yuvarlak avatar,
// ad · başlık · firma · konum · bağlantı sayısı, sonra Hakkında ve telefon.
// Profilim sekmesi ve başkasının profil ekranı ortak kullanır.
export function ProfileIdentity({
  profile,
  onOpenCompany,
  avatarSize = 88,
  avatarUpdatedAt,
  belowIdentity,
  isSelf = false,
  coverUpdatedAt,
  onEditCover,
  onEditProfile,
  onOpenConnections,
}: Props) {
  const name = `${profile.firstName} ${profile.lastName}`;
  const company = profile.company;
  // Başlık boşsa unvan ve firma adından otomatik kurulur.
  const headline =
    profile.headline?.trim() ||
    [profile.position?.trim(), company?.name?.trim()].filter(Boolean).join(' · ');
  const about = profile.about?.trim() ?? '';
  const cover = coverUpdatedAt !== undefined ? coverUpdatedAt : profile.coverUpdatedAt;

  return (
    <View style={styles.block}>
      <View>
        <ProfileCover userId={profile.id} coverUpdatedAt={cover} />
        {isSelf && onEditCover ? (
          <Pressable
            onPress={onEditCover}
            accessibilityRole="button"
            accessibilityLabel="Kapak fotoğrafını değiştir"
            hitSlop={6}
            style={({ pressed }) => [styles.coverEdit, pressed && styles.pressedFade]}
          >
            <Ionicons name="pencil" size={16} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={[styles.avatarWrap, { marginTop: -(avatarSize / 2) }]}>
          {/* Kişi sayfası: kişinin kendi fotoğrafı (yoksa baş harfleri). */}
          <UserAvatar
            userId={profile.id}
            firstName={profile.firstName}
            lastName={profile.lastName}
            avatarUpdatedAt={avatarUpdatedAt !== undefined ? avatarUpdatedAt : profile.avatarUpdatedAt}
            size={avatarSize}
          />
        </View>

        <View style={styles.nameRow}>
          <Text style={styles.name} accessibilityRole="header">
            {name}
          </Text>
          {isSelf && onEditProfile ? (
            <Pressable
              onPress={onEditProfile}
              accessibilityRole="button"
              accessibilityLabel="Profil bilgilerini düzenle"
              hitSlop={8}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressedFade]}
            >
              <Ionicons name="pencil" size={18} color={colors.primary} />
            </Pressable>
          ) : null}
        </View>

        {headline ? <Text style={styles.headline}>{headline}</Text> : null}

        {company ? (
          <Pressable
            onPress={() => onOpenCompany?.(company.id)}
            disabled={!onOpenCompany}
            accessibilityRole={onOpenCompany ? 'button' : undefined}
            accessibilityLabel={onOpenCompany ? `${company.name}, firma sayfasını aç` : company.name}
            hitSlop={6}
            style={({ pressed }) => [styles.companyLink, pressed && styles.pressedFade]}
          >
            <Text style={styles.company}>{company.name}</Text>
          </Pressable>
        ) : null}

        {profile.location?.trim() ? <Text style={styles.location}>{profile.location.trim()}</Text> : null}

        <Pressable
          onPress={onOpenConnections}
          disabled={!onOpenConnections}
          accessibilityRole={onOpenConnections ? 'button' : undefined}
          accessibilityLabel={`${profile.connectionCount ?? 0} bağlantı`}
          hitSlop={6}
          style={({ pressed }) => [styles.connectionsLink, pressed && onOpenConnections && styles.pressedFade]}
        >
          <Text style={styles.connections}>{profile.connectionCount ?? 0} bağlantı</Text>
        </Pressable>
      </View>

      {belowIdentity ? <View style={styles.below}>{belowIdentity}</View> : null}

      {about ? (
        <View style={styles.aboutBlock}>
          <Text style={styles.aboutTitle} accessibilityRole="header">
            Hakkında
          </Text>
          <Text style={styles.aboutText}>{about}</Text>
        </View>
      ) : isSelf && onEditProfile ? (
        <Pressable
          onPress={onEditProfile}
          accessibilityRole="button"
          accessibilityLabel="Hakkında ekle"
          style={({ pressed }) => [styles.addAboutRow, pressed && styles.pressedRow]}
        >
          <Ionicons name="add" size={18} color={colors.accent} />
          <Text style={styles.addAboutText}>Hakkında ekle</Text>
        </Pressable>
      ) : null}

      <View style={styles.phoneRow}>
        <Text style={styles.phoneLabel}>Telefon</Text>
        {/* Sunucu, bağlantı yoksa telefon alanını hiç göndermiyor. */}
        {profile.phone ? (
          <Text style={styles.phoneValue} selectable>
            {profile.phone}
          </Text>
        ) : (
          <Text style={styles.phoneHidden}>Bağlantı kurunca görünür</Text>
        )}
      </View>
    </View>
  );
}

// Kapak fotoğrafı: avatarla aynı önbellek deseni; yoksa düz lacivert zemin.
function ProfileCover({ userId, coverUpdatedAt }: { userId: string; coverUpdatedAt?: string | null }) {
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

  if (photo) {
    return <Image source={{ uri: photo }} style={styles.cover} resizeMode="cover" accessibilityLabel="Kapak fotoğrafı" />;
  }
  return <View style={[styles.cover, styles.coverEmpty]} />;
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.surface },
  // 16:6 şerit, tam genişlik. Yükseklik oranla hesaplanır (web'de de çalışır).
  cover: { width: '100%', aspectRatio: 16 / 6, backgroundColor: colors.primary },
  // Boş kapak: üst bantla birleşmesin diye açık tonlu zemin.
  coverEmpty: { backgroundColor: colors.surfaceTonal, borderBottomWidth: 1, borderBottomColor: colors.border },
  coverEdit: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  body: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.gutter },
  avatarWrap: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { fontFamily: fonts.semibold, fontSize: 21, lineHeight: 27, color: colors.text, flex: 1, minWidth: 0 },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceTonal,
  },
  headline: { ...typography.body, color: colors.text, marginTop: 2 },
  companyLink: { alignSelf: 'flex-start', marginTop: 2 },
  company: { ...typography.label, color: colors.accent },
  location: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  connectionsLink: { alignSelf: 'flex-start', marginTop: spacing.xs },
  connections: { ...typography.label, color: colors.accent },
  pressedFade: { opacity: 0.6 },
  pressedRow: { backgroundColor: colors.pressed },
  below: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.gutter },
  aboutBlock: {
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.gutter,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: spacing.xs,
  },
  aboutTitle: { ...typography.subtitle, color: colors.text },
  aboutText: { ...typography.body, color: colors.text },
  addAboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.gutter,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  addAboutText: { ...typography.label, color: colors.accent },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.gutter,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  phoneLabel: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
  phoneValue: { ...typography.mono, fontSize: 16, color: colors.text },
  phoneHidden: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
});
