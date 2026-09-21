import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking, Platform, Share, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  cancelInvite,
  createInvite,
  fetchInvites,
  type Invite,
  type InviteRelation,
} from '../../api/client';
import { ChipSelect } from '../../components/ChipSelect';
import { ListRow } from '../../components/ListRow';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SectionHeader } from '../../components/SectionHeader';
import { SkeletonList } from '../../components/Skeleton';
import { TextField } from '../../components/TextField';
import { EmptyState, ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { formatRelativeTime } from '../../features/time';
import { useFocusLoad } from '../../features/useFocusLoad';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'Invites'>;

// Davetler (Faz 2, Adım 4). Platform SMS GÖNDERMEZ: sunucu hazır paylaşım
// metnini üretir, kullanıcı onu kendi WhatsApp'ından yollar.

const RELATION_OPTIONS: { value: InviteRelation; label: string }[] = [
  { value: 'tedarikci', label: 'Tedarikçim' },
  { value: 'musteri', label: 'Müşterim' },
  { value: '', label: 'Belirtme' },
];

const relationLabel = (relation: InviteRelation) =>
  relation === 'tedarikci' ? 'Tedarikçi' : relation === 'musteri' ? 'Müşteri' : '';

// Rehberden kopyalanan numara her biçimde gelebilir; wa.me uluslararası
// biçim ister (90 5XX...). Çevrilemezse boş döner ve bağlantı numarasız açılır.
function toWaNumber(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('0090')) d = d.slice(4);
  else if (d.startsWith('90') && d.length === 12) d = d.slice(2);
  if (d.length === 11 && d.startsWith('05')) d = d.slice(1);
  return d.length === 10 && d.startsWith('5') ? `90${d}` : '';
}

// Zaten üye çıkan numara: davet yerine profiline gidip bağlantı isteği.
interface AlreadyMember {
  id: string;
  firstName: string;
  lastName: string;
}

export function InvitesScreen({ navigation }: Props) {
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(fetchInvites);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState<InviteRelation>('tedarikci');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [alreadyMember, setAlreadyMember] = useState<AlreadyMember | null>(null);
  // Yeni oluşturulan (ya da yeniden paylaşılmak istenen) davetin kartı.
  const [current, setCurrent] = useState<Invite | null>(null);
  const [copied, setCopied] = useState(false);

  const openWhatsApp = useCallback((invite: Invite) => {
    const wa = invite.phone ? toWaNumber(invite.phone) : '';
    const text = encodeURIComponent(invite.shareText);
    const url = wa ? `https://wa.me/${wa}?text=${text}` : `https://wa.me/?text=${text}`;
    Linking.openURL(url).catch(() => {});
  }, []);

  // Paylaş kalıbı: telefonda sistem paylaşımı, web'de panoya kopyalama
  // (ProductDetailScreen "Dijital pasaport" bölümündeki desen).
  const shareInvite = useCallback(async (invite: Invite) => {
    if (Platform.OS === 'web') {
      const clipboard = (globalThis as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } })
        .navigator?.clipboard;
      try {
        if (!clipboard) throw new Error('clipboard_yok');
        await clipboard.writeText(invite.shareText);
        setCopied(true);
      } catch {
        // Pano yoksa WhatsApp web'i açalım, metin oradan gitsin.
        const text = encodeURIComponent(invite.shareText);
        Linking.openURL(`https://wa.me/?text=${text}`).catch(() => {});
      }
      return;
    }
    Share.share({ message: invite.shareText }).catch(() => {});
  }, []);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setFormError(null);
    setAlreadyMember(null);
    setCopied(false);
    try {
      const { invite } = await createInvite({
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        relation,
      });
      haptics.success();
      setCurrent(invite);
      setName('');
      setPhone('');
      await reload();
    } catch (err) {
      haptics.error();
      if (err instanceof ApiError && err.code === 'already_member') {
        const user = (err.body as { user?: AlreadyMember } | undefined)?.user ?? null;
        setAlreadyMember(user);
        setFormError(
          user
            ? `Bu numara zaten Avedon'da: ${user.firstName} ${user.lastName}. Profiline gidip bağlantı isteği gönderebilirsiniz.`
            : "Bu numara zaten Avedon'da. Kişiyi arayıp profilinden bağlantı isteği gönderebilirsiniz."
        );
      } else if (err instanceof ApiError && err.code === 'invalid_phone') {
        setFormError('Telefon numarasını 05XX XXX XX XX biçiminde yazın.');
      } else if (err instanceof ApiError && err.code === 'own_phone') {
        setFormError('Bu sizin numaranız. Davet edeceğiniz kişinin numarasını yazın.');
      } else if (err instanceof ApiError && err.code === 'daily_limit') {
        const max = (err.body as { max?: number } | undefined)?.max;
        setFormError(
          max
            ? `Günde en fazla ${max} davet oluşturabilirsiniz. Yarın tekrar deneyin.`
            : 'Günlük davet sınırına ulaştınız. Yarın tekrar deneyin.'
        );
      } else {
        setFormError(friendlyMessage(err, 'Davet oluşturulamadı, tekrar deneyin.'));
      }
    } finally {
      setSubmitting(false);
    }
  }, [name, phone, relation, reload]);

  const remove = useCallback(
    async (invite: Invite) => {
      const who = invite.name || invite.phone || 'Açık davet';
      const ok = await confirmAction({
        title: 'Davet iptal edilsin mi?',
        message: `${who} için oluşturulan davet bağlantısı çalışmayacak.`,
        confirmLabel: 'İptal et',
        destructive: true,
      });
      if (!ok) return;
      try {
        await cancelInvite(invite.id);
        haptics.success();
        setCurrent((prev) => (prev?.id === invite.id ? null : prev));
        await reload();
      } catch (err) {
        haptics.error();
        if (err instanceof ApiError && err.code === 'already_joined') {
          setFormError('Bu davetle biri kayıt olmuş; davet iptal edilemez.');
        } else {
          setFormError(friendlyMessage(err, 'Davet iptal edilemedi, tekrar deneyin.'));
        }
      }
    },
    [reload]
  );

  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        <SkeletonList variant="person" />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.screen}>
        <ErrorState error={error} fallback="Davetler alınamadı" onRetry={reload} />
      </View>
    );
  }

  const invites = data?.invites ?? [];
  const joinedCount = data?.joinedCount ?? 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl(refreshing, refresh)}
    >
      <Text style={styles.intro}>
        Çalıştığınız tedarikçiyi ya da müşteriyi davet edin. Kayıt olunca bağlantınız olur; ürünlerini görür, numune
        ve teklif işlerini buradan yürütürsünüz.
      </Text>

      <View style={styles.block}>
        <View style={styles.form}>
          <TextField
            label="Ad (opsiyonel)"
            value={name}
            onChangeText={setName}
            placeholder="Örn. Ahmet Yılmaz"
            maxLength={80}
          />
          <TextField
            label="Telefon (opsiyonel)"
            value={phone}
            onChangeText={setPhone}
            placeholder="05XX XXX XX XX"
            keyboardType="phone-pad"
            maxLength={20}
          />
          <Text style={styles.hint}>Numarayı yazarsanız o kişi kayıt olunca doğrudan bağlantınız olur.</Text>

          <Text style={styles.fieldLabel}>İlişki</Text>
          <ChipSelect options={RELATION_OPTIONS} value={relation} onChange={setRelation} />

          {formError ? <InlineError message={formError} /> : null}
          {alreadyMember ? (
            <PrimaryButton
              label="Profili aç"
              variant="outline"
              size="sm"
              onPress={() => navigation.navigate('Profile', { userId: alreadyMember.id })}
              style={styles.memberAction}
            />
          ) : null}

          <PrimaryButton
            label={submitting ? 'Oluşturuluyor' : 'Davet oluştur'}
            size="lg"
            disabled={submitting}
            onPress={() => void submit()}
          />
        </View>
      </View>

      {current ? (
        <>
          <SectionHeader title="Davet hazır" />
          <View style={styles.block}>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Paylaşılacak metin</Text>
              <Text style={styles.shareText}>{current.shareText}</Text>

              <View style={styles.codeRow}>
                <Text style={styles.codeLabel}>Davet kodu</Text>
                <Text style={styles.code}>{current.code}</Text>
              </View>

              <PrimaryButton
                label="WhatsApp'tan gönder"
                icon="logo-whatsapp"
                size="lg"
                onPress={() => openWhatsApp(current)}
              />
              <PrimaryButton
                label={copied ? 'Kopyalandı' : Platform.OS === 'web' ? 'Metni kopyala' : 'Paylaş'}
                variant="outline"
                size="lg"
                icon={copied ? 'checkmark' : 'share-outline'}
                onPress={() => void shareInvite(current)}
                style={styles.secondAction}
              />
              <Text style={styles.cardNote}>
                Mesajı biz göndermiyoruz; metni siz paylaşıyorsunuz. Kişi kayıt olunca haber vereceğiz.
              </Text>
            </View>
          </View>
        </>
      ) : null}

      <SectionHeader title="Davetlerim" />
      <View style={styles.block}>
        <Text style={styles.summary}>
          {invites.length} davet · {joinedCount} katıldı
        </Text>
        {invites.length ? (
          invites.map((invite, index) => {
            const joined = invite.status === 'joined';
            const title = invite.name || invite.phone || 'Açık davet';
            const rel = relationLabel(invite.relation);
            return (
              <View key={invite.id} style={index < invites.length - 1 ? styles.divider : undefined}>
                <ListRow
                  title={title}
                  subtitle={
                    [invite.name && invite.phone ? invite.phone : '', rel].filter(Boolean).join(' · ') || undefined
                  }
                  chevron={false}
                  divider={false}
                  accessibilityLabel={`${title}. ${joined ? 'Katıldı' : 'Bekliyor'}`}
                  right={
                    <View style={styles.rowRight}>
                      <View style={[styles.statusBadge, joined ? styles.statusJoined : styles.statusPending]}>
                        <Text style={[styles.statusText, joined && styles.statusTextJoined]}>
                          {joined ? 'Katıldı' : 'Bekliyor'}
                        </Text>
                      </View>
                      <Text style={styles.time}>{formatRelativeTime(invite.createdAt)}</Text>
                    </View>
                  }
                />
                {/* Eylemler satırın ALTINDA ayrı dokunma alanları: web'de iç
                    içe düğme olmasın. */}
                <View style={styles.rowActions}>
                  {joined && invite.joinedUser ? (
                    <Pressable
                      onPress={() => navigation.navigate('Profile', { userId: invite.joinedUser!.id })}
                      accessibilityRole="button"
                      accessibilityLabel={`${invite.joinedUser.firstName} ${invite.joinedUser.lastName} profilini aç`}
                      style={({ pressed }) => [styles.linkWrap, pressed && styles.linkPressed]}
                    >
                      <Ionicons name="person-outline" size={16} color={colors.accent} />
                      <Text style={styles.link}>
                        {invite.joinedUser.firstName} {invite.joinedUser.lastName}
                      </Text>
                    </Pressable>
                  ) : (
                    <>
                      <Pressable
                        onPress={() => {
                          setCurrent(invite);
                          setCopied(false);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Yeniden paylaş: ${title}`}
                        style={({ pressed }) => [styles.linkWrap, pressed && styles.linkPressed]}
                      >
                        <Ionicons name="share-outline" size={16} color={colors.accent} />
                        <Text style={styles.link}>Yeniden paylaş</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void remove(invite)}
                        accessibilityRole="button"
                        accessibilityLabel={`İptal et: ${title}`}
                        style={({ pressed }) => [styles.linkWrap, pressed && styles.linkPressed]}
                      >
                        <Ionicons name="close-circle-outline" size={16} color={colors.danger} />
                        <Text style={[styles.link, styles.linkDanger]}>İptal et</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            );
          })
        ) : (
          <EmptyState
            compact
            icon="person-add-outline"
            title="Henüz davet yok"
            message="Birlikte çalıştığınız firmadan bir kişiyi davet edin; kayıt olunca bağlantınız olur."
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  intro: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  block: { backgroundColor: colors.surface, marginBottom: spacing.blockGap },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },

  form: { padding: spacing.gutter },
  fieldLabel: { ...typography.label, color: colors.text, marginBottom: spacing.xs, marginLeft: spacing.sm },
  hint: { ...typography.caption, color: colors.textMuted, marginTop: -spacing.sm, marginBottom: spacing.md },
  memberAction: { alignSelf: 'flex-start', marginBottom: spacing.sm },

  card: { padding: spacing.gutter, gap: spacing.sm },
  cardLabel: { ...typography.caption, fontFamily: fonts.medium, color: colors.textMuted },
  shareText: {
    ...typography.caption,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    backgroundColor: colors.surfaceTonal,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 2,
  },
  codeRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginBottom: spacing.xs },
  codeLabel: { ...typography.caption, color: colors.textMuted },
  code: { ...typography.monoStrong, fontSize: 22, lineHeight: 28, color: colors.primary, letterSpacing: 1 },
  secondAction: { marginTop: spacing.xs },
  cardNote: { ...typography.caption, fontSize: 11, lineHeight: 16, color: colors.textMuted },

  summary: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sm,
  },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  statusBadge: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  statusPending: { backgroundColor: colors.warningSoft },
  statusJoined: { backgroundColor: colors.successSoft },
  statusText: { ...typography.caption, fontSize: 11, fontFamily: fonts.semibold, color: colors.warning },
  statusTextJoined: { color: colors.success },
  time: { ...typography.caption, fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted },

  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.sm,
  },
  linkWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: MIN_TOUCH - 12, paddingVertical: 4 },
  linkPressed: { opacity: 0.6 },
  link: { ...typography.caption, fontFamily: fonts.semibold, color: colors.accent },
  linkDanger: { color: colors.danger },
});
