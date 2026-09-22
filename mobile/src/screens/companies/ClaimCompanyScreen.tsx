// Sahipsiz firmayı sahiplenme başvurusu (firma rehberi, 2026-09-22).
// Kalıp VerificationScreen ile aynı: DocField belge + isteğe bağlı not + tek
// dolu düğme. Onaylanınca kullanıcı firmaya bağlanır (bildirim gelir).
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { ApiError, claimCompany } from '../../api/client';
import { DocField } from '../../components/passport/DocField';
import type { DocImage } from '../../components/passport/rows';
import { friendlyMessage } from '../../components/StateView';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import { AppBar, Badge, Button, Card, Icon, Input } from '../../ui';

type Props = RootStackScreenProps<'ClaimCompany'>;

const NOTE_LIMIT = 300;

function claimErrorText(err: unknown): string {
  const code = err instanceof ApiError ? err.code : undefined;
  switch (code) {
    case 'already_has_company':
      return 'Zaten bir firmanız var.';
    case 'phone_not_verified':
      return 'Önce telefonunuzu doğrulayın.';
    case 'claim_pending_by_other':
      return 'Bu firma için bekleyen bir başvuru var.';
    case 'request_pending':
      return 'Zaten inceleme bekleyen bir başvurunuz var.';
    case 'already_claimed':
      return 'Bu firma sahiplenilmiş.';
    default:
      return friendlyMessage(err, 'Başvuru gönderilemedi');
  }
}

export function ClaimCompanyScreen({ navigation, route }: Props) {
  const t = useTheme();
  const { companyId, companyName } = route.params;
  const [doc, setDoc] = useState<DocImage>({ kind: 'none' });
  const [note, setNote] = useState('');
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    if (doc.kind !== 'new') {
      setFormError('Önce bir belge yükleyin.');
      return;
    }
    setSending(true);
    setFormError(null);
    try {
      await claimCompany(companyId, { document: doc.dataUrl, note: note.trim() || undefined });
      haptics.success();
      setSent(true);
    } catch (err) {
      haptics.error();
      setFormError(claimErrorText(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar title="Firmayı sahiplen" leading="back" onBack={() => navigation.goBack()} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingVertical: t.space[4], alignItems: 'center' }}
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
          <Text style={[t.type.title22, { color: t.colors.ink }]}>{companyName}</Text>

          {sent ? (
            <Card>
              <View style={{ gap: t.space[3], minWidth: 0 }}>
                <Badge kind="pending" label="İnceleniyor" />
                <Text style={[t.type.body16, { color: t.colors.ink }]}>
                  Başvurunuz alındı. Avedon ekibi belgenizi inceliyor; sonuç bildirimle gelecek.
                </Text>
                <Button kind="secondary" label="Firma sayfasına dön" onPress={() => navigation.goBack()} fullWidth />
              </View>
            </Card>
          ) : (
            <Card>
              <View style={{ gap: t.space[4], minWidth: 0 }}>
                <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                  Vergi levhası ya da faaliyet belgesi yükleyin; Avedon ekibi inceler, onaylanınca sayfa size bağlanır
                  ve ürün ekleyebilirsiniz.
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
                  labelPrefix="Sahiplenme"
                />
                <Input
                  label="Not (isteğe bağlı)"
                  value={note}
                  onChangeText={(value) => setNote(value.slice(0, NOTE_LIMIT))}
                  placeholder="Örn. firmadaki göreviniz"
                  multiline
                  editable={!sending}
                  maxLength={NOTE_LIMIT}
                  accessibilityLabel="Başvuru notu"
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
                    <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{formError}</Text>
                  </View>
                ) : null}
                {/* Ekranın tek dolu düğmesi. */}
                <Button
                  size="lg"
                  label="Sahiplenme başvurusu gönder"
                  loading={sending}
                  disabled={sending || picking || doc.kind !== 'new'}
                  onPress={submit}
                />
              </View>
            </Card>
          )}

          <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
            Belge yalnızca inceleme için kullanılır, başka firmalarla paylaşılmaz.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
