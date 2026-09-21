import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { PublicUserProfile } from '../../api/client';
import { UserAvatar } from '../../components/UserAvatar';
import { colors, fonts, spacing, typography } from '../../theme';

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
}

// Taslak: docs/tasarim-yonleri/CProfil.dc.html. Kenardan kenara beyaz blok:
// 56px avatar + ad, unvan, firma; altında çizgiyle ayrılmış telefon satırı.
// Profilim sekmesi ve başkasının profil ekranı ortak kullanır.
export function ProfileIdentity({
  profile,
  onOpenCompany,
  avatarSize = 56,
  avatarUpdatedAt,
  belowIdentity,
}: Props) {
  const name = `${profile.firstName} ${profile.lastName}`;
  const company = profile.company;
  return (
    <View style={styles.block}>
      <View style={styles.identityRow}>
        {/* Kişi sayfası: kişinin kendi fotoğrafı (yoksa baş harfleri).
            Firma kimliği hemen altındaki firma adı bağlantısında. */}
        <UserAvatar
          userId={profile.id}
          firstName={profile.firstName}
          lastName={profile.lastName}
          avatarUpdatedAt={avatarUpdatedAt !== undefined ? avatarUpdatedAt : profile.avatarUpdatedAt}
          size={avatarSize}
        />
        <View style={styles.texts}>
          <Text style={styles.name} accessibilityRole="header">
            {name}
          </Text>
          {profile.position ? <Text style={styles.position}>{profile.position}</Text> : null}
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
        </View>
      </View>

      {belowIdentity}

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

const styles = StyleSheet.create({
  block: { backgroundColor: colors.surface, paddingHorizontal: spacing.gutter, paddingTop: spacing.md },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.gutter, paddingBottom: spacing.gutter },
  texts: { flex: 1, gap: 1 },
  name: { fontFamily: fonts.semibold, fontSize: 21, lineHeight: 27, color: colors.text },
  position: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
  companyLink: { alignSelf: 'flex-start' },
  company: { ...typography.label, color: colors.accent },
  pressedFade: { opacity: 0.6 },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 48,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  phoneLabel: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
  phoneValue: { ...typography.mono, fontSize: 16, color: colors.text },
  phoneHidden: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
});
