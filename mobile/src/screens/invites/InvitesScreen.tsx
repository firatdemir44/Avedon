// Davetler (yeni tasarım, 4. adım — DESIGN.md §2, §3).
//
// Veri katmanı DEĞİŞMEDİ: aynı uçlar (fetchInvites / createInvite /
// cancelInvite), aynı hata kodları, aynı paylaşım kalıbı ve aynı navigasyon
// hedefleri. Yalnızca görünüm yeni: `Screen` + `Card` + `Input` + `ChipRow` +
// `ListRow` + `Badge` + `Button`.
//
// Platform SMS GÖNDERMEZ: sunucu hazır paylaşım metnini üretir, kullanıcı onu
// kendi WhatsApp'ından yollar.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Linking, Platform, Share } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  cancelInvite,
  createInvite,
  fetchInvites,
  type Invite,
  type InviteRelation,
} from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { formatRelativeTime } from '../../features/time';
import { useFocusLoad } from '../../features/useFocusLoad';
import { useTheme } from '../../theme/ThemeContext';
import {
  Badge,
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  Icon,
  Input,
  ListRow,
  Screen,
  SectionTitle,
  SkeletonRow,
} from '../../ui';

type Props = RootStackScreenProps<'Invites'>;

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
  const t = useTheme();
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
      <Screen>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </Screen>
    );
  }

  if (status === 'error') {
    return (
      <Screen>
        <EmptyState
          icon="warning"
          title="Davetler alınamadı"
          description={friendlyMessage(error, 'Bağlantıyı kontrol edip tekrar deneyin.')}
          actionLabel="Tekrar dene"
          onAction={reload}
        />
      </Screen>
    );
  }

  const invites = data?.invites ?? [];
  const joinedCount = data?.joinedCount ?? 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.colors.surface0 }}
      contentContainerStyle={{ paddingVertical: t.space[4], alignItems: 'center' }}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl(refreshing, refresh)}
    >
      <View
        style={{
          width: '100%',
          maxWidth: t.size.maxContentWidth,
          paddingHorizontal: t.space[4],
          gap: t.space[6],
          minWidth: 0,
        }}
      >
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
          Çalıştığınız tedarikçiyi ya da müşteriyi davet edin. Kayıt olunca bağlantınız olur; ürünlerini görür,
          numune ve teklif işlerini buradan yürütürsünüz.
        </Text>

        {/* Davet formu */}
        <Card>
          <View style={{ gap: t.space[4], minWidth: 0 }}>
            <Input
              label="Ad (opsiyonel)"
              value={name}
              onChangeText={setName}
              placeholder="Örn. Ahmet Yılmaz"
              maxLength={80}
            />
            <Input
              label="Telefon (opsiyonel)"
              value={phone}
              onChangeText={setPhone}
              placeholder="05XX XXX XX XX"
              keyboardType="phone-pad"
              maxLength={20}
              helper="Numarayı yazarsanız o kişi kayıt olunca doğrudan bağlantınız olur."
            />

            <View style={{ gap: t.space[2], minWidth: 0 }}>
              <Text style={[t.type.label14, { color: t.colors.ink2 }]}>İlişki</Text>
              <ChipRow>
                {RELATION_OPTIONS.map((option) => (
                  <Chip
                    key={option.value || 'bos'}
                    label={option.label}
                    selected={relation === option.value}
                    onPress={() => setRelation(option.value)}
                  />
                ))}
              </ChipRow>
            </View>

            {formError ? <InlineBanner message={formError} /> : null}
            {alreadyMember ? (
              <Button
                kind="secondary"
                label="Profili aç"
                icon="user"
                onPress={() => navigation.navigate('Profile', { userId: alreadyMember.id })}
              />
            ) : null}

            {/* Davet kartı açıkken oradaki WhatsApp düğmesi dolu; bu düğme kenarlıklı olur (ekranda tek dolu düğme). */}
            <Button
              kind={current ? 'secondary' : 'primary'}
              size="lg"
              label="Davet oluştur"
              loading={submitting}
              disabled={submitting}
              onPress={() => void submit()}
            />
          </View>
        </Card>

        {current ? (
          <View style={{ gap: t.space[3], minWidth: 0 }}>
            <SectionTitle title="Davet hazır" />
            <Card>
              <View style={{ gap: t.space[3], minWidth: 0 }}>
                <Text style={[t.type.label14, { color: t.colors.ink2 }]}>Paylaşılacak metin</Text>
                <Text
                  style={[
                    t.type.body14,
                    {
                      color: t.colors.ink,
                      backgroundColor: t.colors.surface2,
                      borderRadius: t.radius.md,
                      borderWidth: 1,
                      borderColor: t.colors.line,
                      padding: t.space[3],
                    },
                  ]}
                >
                  {current.shareText}
                </Text>

                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: t.space[2], minWidth: 0 }}>
                  <Text style={[t.type.body14, { color: t.colors.ink2 }]}>Davet kodu</Text>
                  <Text
                    numberOfLines={1}
                    style={[t.type.mono20, { color: t.colors.brand, flex: 1, minWidth: 0 }]}
                  >
                    {current.code}
                  </Text>
                </View>

                {/* Bu bölümdeki tek dolu düğme; üstteki form düğmesi ekranda
                    yalnızca form görünürken duruyor (davet oluşunca kart açılır). */}
                <Button
                  size="lg"
                  label="WhatsApp'tan gönder"
                  icon="whatsapp"
                  onPress={() => openWhatsApp(current)}
                />
                <Button
                  kind="secondary"
                  size="lg"
                  label={copied ? 'Kopyalandı' : Platform.OS === 'web' ? 'Metni kopyala' : 'Paylaş'}
                  icon={copied ? 'check' : 'share'}
                  onPress={() => void shareInvite(current)}
                />
                <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                  Mesajı biz göndermiyoruz; metni siz paylaşıyorsunuz. Kişi kayıt olunca haber vereceğiz.
                </Text>
              </View>
            </Card>
          </View>
        ) : null}

        {/* Davetlerim */}
        <View style={{ gap: t.space[2], minWidth: 0 }}>
          <SectionTitle title="Davetlerim" />
          <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
            {invites.length} davet · {joinedCount} katıldı
          </Text>

          {invites.length ? (
            invites.map((invite, index) => {
              const joined = invite.status === 'joined';
              const title = invite.name || invite.phone || 'Açık davet';
              const rel = relationLabel(invite.relation);
              const subtitle =
                [invite.name && invite.phone ? invite.phone : '', rel, formatRelativeTime(invite.createdAt)]
                  .filter(Boolean)
                  .join(' · ') || undefined;
              return (
                <View key={invite.id} style={{ minWidth: 0 }}>
                  <ListRow
                    title={title}
                    subtitle={subtitle}
                    avatarName={title}
                    avatarKind="person"
                    // Rozet ikon + metin taşır, yalnız renk değil (DESIGN.md §6).
                    right={<Badge kind={joined ? 'delivered' : 'pending'} label={joined ? 'Katıldı' : 'Bekliyor'} />}
                    divider={index < invites.length - 1}
                  />
                  {/* Eylemler satırın İÇİNDE değil ALTINDA: iç içe düğme olmaz. */}
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: t.space[2],
                      paddingVertical: t.space[2],
                      minWidth: 0,
                    }}
                  >
                    {joined && invite.joinedUser ? (
                      <Button
                        kind="quiet"
                        icon="user"
                        label={`${invite.joinedUser.firstName} ${invite.joinedUser.lastName}`}
                        accessibilityLabel={`${invite.joinedUser.firstName} ${invite.joinedUser.lastName} profilini aç`}
                        onPress={() => navigation.navigate('Profile', { userId: invite.joinedUser!.id })}
                      />
                    ) : (
                      <>
                        <Button
                          kind="quiet"
                          icon="share"
                          label="Yeniden paylaş"
                          accessibilityLabel={`Yeniden paylaş: ${title}`}
                          onPress={() => {
                            setCurrent(invite);
                            setCopied(false);
                          }}
                        />
                        <Button
                          kind="danger"
                          icon="x"
                          label="İptal et"
                          accessibilityLabel={`İptal et: ${title}`}
                          onPress={() => void remove(invite)}
                        />
                      </>
                    )}
                  </View>
                </View>
              );
            })
          ) : (
            <EmptyState
              icon="plus"
              title="Henüz davet yok"
              description="Birlikte çalıştığınız firmadan bir kişiyi davet edin; kayıt olunca bağlantınız olur."
            />
          )}
        </View>
      </View>
    </ScrollView>
  );
}

// Form hatası: ikon + metin, `dangerSoft` zemin (RequestsScreen'deki banner).
function InlineBanner({ message }: { message: string }) {
  const t = useTheme();
  return (
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
      <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{message}</Text>
    </View>
  );
}
