import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  createCompanyFaq,
  deleteCompanyFaq,
  fetchCompanyFaqs,
  updateCompanyFaq,
  type CompanyFaq,
} from '../../api/client';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SectionHeader } from '../../components/SectionHeader';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { useFocusLoad } from '../../features/useFocusLoad';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'CompanyFaq'>;

// Firmanın sık sorulanları (Faz 2, Adım 3): satıcı asistanı alıcı sorularını
// önce katalogdan, sonra bu cevaplardan yanıtlar. FİYAT YAZILMAZ; fiyat
// yalnızca teklifle gider.

// "new": yeni kayıt formu açık.
type EditingId = string | 'new' | null;

export function CompanyFaqScreen(_props: Props) {
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(fetchCompanyFaqs);
  const [editing, setEditing] = useState<EditingId>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const startNew = useCallback(() => {
    setEditing('new');
    setQuestion('');
    setAnswer('');
    setFormError(null);
  }, []);

  const startEdit = useCallback((faq: CompanyFaq) => {
    setEditing(faq.id);
    setQuestion(faq.question);
    setAnswer(faq.answer);
    setFormError(null);
  }, []);

  const cancel = useCallback(() => {
    setEditing(null);
    setFormError(null);
  }, []);

  const save = useCallback(async () => {
    const q = question.trim();
    const a = answer.trim();
    if (q.length < 3) {
      setFormError('Soruyu en az 3 karakter yazın.');
      return;
    }
    if (!a) {
      setFormError('Cevap boş olamaz.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing === 'new') await createCompanyFaq({ question: q, answer: a });
      else if (editing) await updateCompanyFaq(editing, { question: q, answer: a });
      haptics.success();
      setEditing(null);
      await reload();
    } catch (err) {
      haptics.error();
      if (err instanceof ApiError && err.code === 'too_many_faqs') {
        setFormError('Sık sorulanlar sınırına ulaştınız. Yenisini eklemek için birini silin.');
      } else {
        setFormError(friendlyMessage(err, 'Kaydedilemedi, tekrar deneyin.'));
      }
    } finally {
      setSaving(false);
    }
  }, [answer, editing, question, reload]);

  const remove = useCallback(
    async (faq: CompanyFaq) => {
      const ok = await confirmAction({
        title: 'Silinsin mi?',
        message: `"${faq.question}" sık sorulanlardan silinecek. Asistanınız bu cevabı artık kullanmayacak.`,
        confirmLabel: 'Sil',
        destructive: true,
      });
      if (!ok) return;
      try {
        await deleteCompanyFaq(faq.id);
        haptics.success();
        setEditing((prev) => (prev === faq.id ? null : prev));
        await reload();
      } catch (err) {
        haptics.error();
        setFormError(friendlyMessage(err, 'Silinemedi, tekrar deneyin.'));
      }
    },
    [reload]
  );

  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        <SkeletonList variant="conversation" />
      </View>
    );
  }

  if (status === 'error' && error instanceof ApiError && error.status === 403) {
    return (
      <View style={styles.screen}>
        <EmptyState
          icon="business-outline"
          title="Sık sorulanlar firmaya bağlı"
          message="Bu cevapları asistanınız alıcılara verir. Bir firmaya bağlandığınızda burada düzenleyebilirsiniz."
        />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.screen}>
        <ErrorState error={error} fallback="Sık sorulanlar alınamadı" onRetry={reload} />
      </View>
    );
  }

  const faqs = data?.faqs ?? [];

  const form = (
    <View style={styles.form}>
      <Text style={styles.fieldLabel}>Soru</Text>
      <TextInput
        style={styles.input}
        value={question}
        onChangeText={setQuestion}
        multiline
        maxLength={300}
        placeholder="Örn: En küçük sipariş miktarınız nedir?"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Soru"
      />
      <Text style={styles.fieldLabel}>Cevap</Text>
      <TextInput
        style={[styles.input, styles.answerInput]}
        value={answer}
        onChangeText={setAnswer}
        multiline
        maxLength={1000}
        placeholder="Örn: Örme kumaşlarda 300 kg, dokumada 1.000 metre."
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Cevap"
      />
      {formError ? <InlineError message={formError} /> : null}
      <View style={styles.formActions}>
        <PrimaryButton
          label={saving ? 'Kaydediliyor' : 'Kaydet'}
          onPress={() => void save()}
          disabled={saving}
          style={styles.formAction}
        />
        <PrimaryButton label="Vazgeç" variant="outline" onPress={cancel} disabled={saving} style={styles.formAction} />
      </View>
    </View>
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl(refreshing, refresh)}
    >
      <Text style={styles.intro}>
        Asistanınız alıcı sorularını bu cevaplara göre yanıtlar. Fiyat yazmayın; fiyat yalnızca teklifle gider.
      </Text>

      {editing === 'new' ? (
        <>
          <SectionHeader title="Yeni soru" />
          <View style={styles.block}>{form}</View>
        </>
      ) : (
        <View style={styles.block}>
          <Pressable
            onPress={startNew}
            accessibilityRole="button"
            accessibilityLabel="Yeni sık sorulan ekle"
            android_ripple={{ color: colors.pressed }}
            style={({ pressed }) => [styles.addRow, pressed && styles.pressed]}
          >
            <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
            <Text style={styles.addLabel}>Yeni soru ekle</Text>
          </Pressable>
        </View>
      )}

      <SectionHeader title="Sık sorulanlar" count={faqs.length} />
      <View style={styles.block}>
        {faqs.length ? (
          faqs.map((faq, index) => {
            if (editing === faq.id) {
              return (
                <View key={faq.id} style={index < faqs.length - 1 ? styles.divider : undefined}>
                  {form}
                  <View style={styles.removeWrap}>
                    <PrimaryButton label="Sil" variant="outline" icon="trash-outline" onPress={() => void remove(faq)} />
                  </View>
                </View>
              );
            }
            return (
              <View key={faq.id} style={[styles.row, index < faqs.length - 1 && styles.divider]}>
                <Pressable
                  onPress={() => startEdit(faq)}
                  accessibilityRole="button"
                  accessibilityLabel={`${faq.question}. Düzenle`}
                  android_ripple={{ color: colors.pressed }}
                  style={({ pressed }) => [styles.rowTexts, pressed && styles.pressed]}
                >
                  <Text style={styles.question}>{faq.question}</Text>
                  <Text style={styles.answer}>{faq.answer}</Text>
                </Pressable>
                {/* Çöp ikonu satırın YANINDA: web'de iç içe düğme olmasın. */}
                <Pressable
                  onPress={() => void remove(faq)}
                  accessibilityRole="button"
                  accessibilityLabel={`Sil: ${faq.question}`}
                  hitSlop={8}
                  style={({ pressed }) => [styles.removeButton, pressed && styles.iconPressed]}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </Pressable>
              </View>
            );
          })
        ) : (
          <EmptyState
            compact
            icon="help-circle-outline"
            title="Henüz sık sorulan yok"
            message="MOQ, termin, sertifika ve numune koşullarınızı yazarsanız asistanınız bunları kendisi cevaplar."
            actionLabel="Yeni soru ekle"
            onAction={startNew}
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
  pressed: { backgroundColor: colors.pressed },
  iconPressed: { opacity: 0.6 },

  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH + 8,
    paddingHorizontal: spacing.gutter,
  },
  addLabel: { ...typography.label, fontFamily: fonts.semibold, color: colors.primary },

  row: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.sm },
  rowTexts: { flex: 1, gap: 2, minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: spacing.gutter, paddingVertical: spacing.sm },
  question: { ...typography.label, fontFamily: fonts.semibold, color: colors.text },
  answer: { ...typography.caption, fontSize: 14, lineHeight: 19, color: colors.textMuted },
  removeButton: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },

  form: { padding: spacing.gutter, gap: spacing.sm },
  fieldLabel: { ...typography.caption, fontFamily: fonts.medium, color: colors.textMuted },
  input: {
    minHeight: MIN_TOUCH,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTonal,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: 'top',
  },
  answerInput: { minHeight: 96 },
  formActions: { flexDirection: 'row', gap: spacing.sm },
  formAction: { flex: 1 },
  removeWrap: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.md },
});
