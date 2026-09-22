import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  applyForVerification,
  fetchVerificationState,
  type VerificationState,
} from '../../api/client';
import { DocField } from '../../components/passport/DocField';
import type { DocImage } from '../../components/passport/rows';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SectionHeader } from '../../components/SectionHeader';
import { SkeletonDetail } from '../../components/Skeleton';
import { ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { useFocusLoad } from '../../features/useFocusLoad';
import { haptics } from '../../features/haptics';
import { formatMonthYear } from '../../features/time';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'Verification'>;

// Firma doğrulama başvurusu (2026-09-22). GİZLİLİK: kararı kimin verdiği hiçbir
// yerde yazmaz; metinlerde yalnızca "Avedon ekibi" geçer (sunucu da yönetici
// kimliğini döndürmüyor).

const NOTE_LIMIT = 300;

function levelText(level: string): string {
  if (level === 'belge') return 'Belge ile';
  if (level === 'ziyaret') return 'Yerinde ziyaretle';
  return 'Doğrulandı';
}

export function VerificationScreen(_props: Props) {
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(fetchVerificationState);
  const [doc, setDoc] = useState<DocImage>({ kind: 'none' });
  const [note, setNote] = useState('');
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    if (doc.kind !== 'new') {
      setFormError('Önce bir belge yükleyin.');
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
          ? 'Zaten inceleme bekleyen bir başvurunuz var.'
          : code === 'already_verified'
            ? 'Firmanız zaten doğrulanmış.'
            : code === 'no_company'
              ? 'Önce bir firmaya bağlı olmanız gerekiyor.'
              : friendlyMessage(err, 'Başvuru gönderilemedi')
      );
    } finally {
      setSending(false);
    }
  };

  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        <SkeletonDetail variant="timeline" />
      </View>
    );
  }

  if (status === 'error') {
    const code = error instanceof ApiError ? error.code : undefined;
    if (code === 'no_company') {
      return (
        <View style={styles.screen}>
          <View style={styles.block}>
            <Text style={styles.paragraph}>
              Doğrulama başvurusu için önce bir firmaya bağlı olmanız gerekiyor.
            </Text>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.screen}>
        <ErrorState error={error} fallback="Doğrulama durumu alınamadı" onRetry={reload} />
      </View>
    );
  }

  const state = data as VerificationState;
  const pending = state.request?.status === 'pending' || state.verification === 'inceleniyor';
  const verified = state.verification === 'dogrulanmis';
  const rejected = !verified && !pending && state.request?.status === 'rejected';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={refreshControl(refreshing, refresh)}
      keyboardShouldPersistTaps="handled"
    >
      {/* Durum kartı */}
      <View
        style={[
          styles.statusCard,
          verified ? styles.statusCardOk : pending ? styles.statusCardPending : styles.statusCardNone,
        ]}
      >
        <Ionicons
          name={verified ? 'shield-checkmark' : pending ? 'time-outline' : 'shield-outline'}
          size={26}
          color={verified ? colors.success : pending ? colors.warning : colors.chevron}
        />
        <View style={styles.statusTexts}>
          <Text style={styles.statusTitle}>
            {verified ? 'Doğrulandı' : pending ? 'İnceleniyor' : 'Doğrulanmamış'}
          </Text>
          <Text style={styles.statusBody}>
            {verified
              ? `${levelText(state.level)}${state.verifiedAt ? ` · ${formatMonthYear(state.verifiedAt)}` : ''}`
              : pending
                ? 'Avedon ekibi belgenizi inceliyor. Sonuç bildirimle gelecek.'
                : 'Firma sayfanızda doğrulanmış rozeti yok.'}
          </Text>
        </View>
      </View>

      {rejected && state.request ? (
        <>
          <SectionHeader title="Önceki başvuru" />
          <View style={styles.block}>
            <Text style={styles.rejectTitle}>Başvurunuz kabul edilmedi.</Text>
            {state.request.adminNote ? (
              <Text style={styles.paragraph}>{state.request.adminNote}</Text>
            ) : (
              <Text style={styles.paragraph}>Belgeyi kontrol edip yeniden başvurabilirsiniz.</Text>
            )}
          </View>
        </>
      ) : null}

      {!verified && !pending ? (
        <>
          <SectionHeader title="Doğrulama iste" />
          <View style={styles.block}>
            <Text style={styles.paragraph}>
              Vergi levhası ya da faaliyet belgesi yeterlidir. Belge yalnızca inceleme için kullanılır,
              karar sonrası silinir.
            </Text>
            <View style={styles.docWrap}>
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
                labelPrefix="Doğrulama"
              />
            </View>
            <Text style={styles.fieldLabel}>Not (isteğe bağlı)</Text>
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={(t) => setNote(t.slice(0, NOTE_LIMIT))}
              placeholder="Eklemek istediğiniz kısa bir not"
              placeholderTextColor={colors.textMuted}
              multiline
              editable={!sending}
              maxLength={NOTE_LIMIT}
              accessibilityLabel="Başvuru notu"
            />
            {formError ? <InlineError message={formError} style={styles.formError} /> : null}
            <PrimaryButton
              label={sending ? 'Gönderiliyor...' : 'Doğrulama iste'}
              size="lg"
              onPress={submit}
              disabled={sending || picking || doc.kind !== 'new'}
            />
          </View>
        </>
      ) : null}

      <Text style={styles.footNote}>
        Doğrulamayı Avedon ekibi yapar. Belgeniz başka firmalarla paylaşılmaz.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  block: { backgroundColor: colors.surface, paddingHorizontal: spacing.gutter, paddingVertical: spacing.md },
  statusCard: {
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.md,
    borderLeftWidth: 4,
  },
  statusCardOk: { borderLeftColor: colors.success },
  statusCardPending: { borderLeftColor: colors.warning },
  statusCardNone: { borderLeftColor: colors.borderStrong },
  statusTexts: { flex: 1, minWidth: 0, gap: 2 },
  statusTitle: { ...typography.subtitle, fontFamily: fonts.semibold, color: colors.text },
  statusBody: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
  rejectTitle: {
    ...typography.label,
    fontFamily: fonts.semibold,
    color: colors.danger,
    marginBottom: spacing.xs,
  },
  paragraph: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
  docWrap: { marginTop: spacing.md },
  fieldLabel: { ...typography.label, color: colors.text, marginTop: spacing.sm, marginBottom: spacing.xs },
  noteInput: {
    fontFamily: fonts.regular,
    fontSize: 16,
    minHeight: MIN_TOUCH + 20,
    color: colors.text,
    backgroundColor: colors.surfaceTonal,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    textAlignVertical: 'top',
  },
  formError: { marginBottom: spacing.md },
  footNote: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
  },
});
