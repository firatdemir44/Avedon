// Firma doğrulama başvurusu (yeni tasarım, 4. adım — DESIGN.md §2, §3).
//
// Veri katmanı DEĞİŞMEDİ: aynı uçlar (fetchVerificationState /
// applyForVerification), aynı hata kodları, aynı belge bileşeni (DocField).
// Görünüm yeni: durum kartı `ui/Card` + `ui/Badge` (kartın sol kenarında
// renkli şerit YOK, DESIGN.md §7), not `ui/Input`, gönder `ui/Button`.
//
// GİZLİLİK: kararı kimin verdiği hiçbir yerde yazmaz; metinlerde yalnızca
// "Takyon ekibi" geçer (sunucu da yönetici kimliğini döndürmüyor).
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  applyForVerification,
  fetchVerificationState,
  type VerificationState,
} from '../../api/client';
import { DocField } from '../../components/passport/DocField';
import type { DocImage } from '../../components/passport/rows';
import { friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { useFocusLoad } from '../../features/useFocusLoad';
import { haptics } from '../../features/haptics';
import { formatMonthYear } from '../../features/time';
import { useTheme } from '../../theme/ThemeContext';
import { tr } from '../../i18n';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  Input,
  Screen,
  SectionTitle,
  SkeletonText,
} from '../../ui';

type Props = RootStackScreenProps<'Verification'>;

const NOTE_LIMIT = 300;

function levelText(level: string): string {
  if (level === 'belge') return tr('Belge ile');
  if (level === 'ziyaret') return tr('Yerinde ziyaretle');
  return tr('Doğrulandı');
}

export function VerificationScreen(_props: Props) {
  const t = useTheme();
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(fetchVerificationState);
  const [doc, setDoc] = useState<DocImage>({ kind: 'none' });
  const [note, setNote] = useState('');
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    if (doc.kind !== 'new') {
      setFormError(tr('Önce bir belge yükleyin.'));
      return;
    }
    setSending(true);
    setFormError(null);
    try {
      await applyForVerification({ document: doc.dataUrl, note: note.trim() || undefined });
      haptics.success();
      setDoc({ kind: 'none' });
      setNote('');
      await reload();
    } catch (err) {
      haptics.error();
      const code = err instanceof ApiError ? err.code : undefined;
      setFormError(
        code === 'request_pending'
          ? tr('Zaten inceleme bekleyen bir başvurunuz var.')
          : code === 'already_verified'
            ? tr('Firmanız zaten doğrulanmış.')
            : code === 'no_company'
              ? tr('Önce bir firmaya bağlı olmanız gerekiyor.')
              : friendlyMessage(err, tr('Başvuru gönderilemedi'))
      );
    } finally {
      setSending(false);
    }
  };

  if (status === 'loading') {
    return (
      <Screen>
        <SkeletonText lines={4} />
        <SkeletonText lines={3} />
      </Screen>
    );
  }

  if (status === 'error') {
    const code = error instanceof ApiError ? error.code : undefined;
    if (code === 'no_company') {
      return (
        <Screen>
          <EmptyState
            icon="business-outline"
            title={tr('Önce bir firmaya bağlanın')}
            description={tr('Doğrulama başvurusu için önce bir firmaya bağlı olmanız gerekiyor.')}
          />
        </Screen>
      );
    }
    return (
      <Screen>
        <EmptyState
          icon="warning"
          title={tr('Doğrulama durumu alınamadı')}
          description={friendlyMessage(error, tr('Bağlantıyı kontrol edip tekrar deneyin.'))}
          actionLabel={tr('Tekrar dene')}
          onAction={reload}
        />
      </Screen>
    );
  }

  const state = data as VerificationState;
  const pending = state.request?.status === 'pending' || state.verification === 'inceleniyor';
  const verified = state.verification === 'dogrulanmis';
  const rejected = !verified && !pending && state.request?.status === 'rejected';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.colors.surface0 }}
      contentContainerStyle={{ paddingVertical: t.space[4], alignItems: 'center' }}
      refreshControl={refreshControl(refreshing, refresh)}
      keyboardShouldPersistTaps="handled"
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
        {/* Durum kartı: rozet ikon + metin taşır, durum yalnız renkle verilmez. */}
        <Card>
          <View style={{ gap: t.space[2], minWidth: 0 }}>
            <Badge
              kind={verified ? 'verified' : pending ? 'pending' : 'cancelled'}
              label={verified ? tr('Doğrulandı') : pending ? tr('İnceleniyor') : tr('Doğrulanmamış')}
            />
            <Text style={[t.type.body16, { color: t.colors.ink }]}>
              {verified
                ? `${levelText(state.level)}${state.verifiedAt ? ` · ${formatMonthYear(state.verifiedAt)}` : ''}`
                : pending
                  ? tr('Takyon ekibi belgenizi inceliyor. Sonuç bildirimle gelecek.')
                  : tr('Firma sayfanızda doğrulanmış rozeti yok.')}
            </Text>
          </View>
        </Card>

        {rejected && state.request ? (
          <View style={{ gap: t.space[3], minWidth: 0 }}>
            <SectionTitle title={tr('Önceki başvuru')} />
            <Card>
              <View style={{ gap: t.space[2], minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minWidth: 0 }}>
                  <Icon name="warning" size={t.size.iconSm} color="danger" />
                  <Text style={[t.type.body16Strong, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>
                    {tr('Başvurunuz kabul edilmedi.')}
                  </Text>
                </View>
                <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                  {state.request.adminNote || tr('Belgeyi kontrol edip yeniden başvurabilirsiniz.')}
                </Text>
              </View>
            </Card>
          </View>
        ) : null}

        {!verified && !pending ? (
          <View style={{ gap: t.space[3], minWidth: 0 }}>
            <SectionTitle title={tr('Doğrulama iste')} />
            <Card>
              <View style={{ gap: t.space[4], minWidth: 0 }}>
                <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                  {tr('Vergi levhası ya da faaliyet belgesi yeterlidir. Belge yalnızca inceleme için kullanılır, karar sonrası silinir.')}
                </Text>
                <DocField
                  image={doc}
                  onChange={(next) => {
                    setFormError(null);
                    setDoc(next);
                  }}
                  busy={picking}
                  onBusyChange={setPicking}
                  onError={setFormError}
                  disabled={sending}
                  labelPrefix={tr('Doğrulama')}
                />
                <Input
                  label={tr('Not (isteğe bağlı)')}
                  value={note}
                  onChangeText={(value) => setNote(value.slice(0, NOTE_LIMIT))}
                  placeholder={tr('Eklemek istediğiniz kısa bir not')}
                  multiline
                  editable={!sending}
                  maxLength={NOTE_LIMIT}
                  accessibilityLabel={tr('Başvuru notu')}
                />
                {formError ? (
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
                      {formError}
                    </Text>
                  </View>
                ) : null}
                {/* Ekranın tek dolu düğmesi. */}
                <Button
                  size="lg"
                  label={tr('Doğrulama iste')}
                  loading={sending}
                  disabled={sending || picking || doc.kind !== 'new'}
                  onPress={submit}
                />
              </View>
            </Card>
          </View>
        ) : null}

        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
          {tr('Doğrulamayı Takyon ekibi yapar. Belgeniz başka firmalarla paylaşılmaz.')}
        </Text>
      </View>
    </ScrollView>
  );
}
