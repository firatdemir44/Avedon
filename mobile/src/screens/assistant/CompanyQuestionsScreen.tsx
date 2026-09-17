import React, { useCallback, useLayoutEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  answerCompanyQuestion,
  fetchCompanyQuestions,
  type CompanyQuestion,
} from '../../api/client';
import { HeaderButton } from '../../components/HeaderButton';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SectionHeader } from '../../components/SectionHeader';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { haptics } from '../../features/haptics';
import { formatRelativeTime } from '../../features/time';
import { useFocusLoad } from '../../features/useFocusLoad';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'CompanyQuestions'>;

// Satıcı tarafı (Faz 2, Adım 3): asistan alıcının sorusunu katalogda
// bulamazsa firmaya iletir; burada cevaplanır. Cevap alıcının sohbetine düşer
// ve isteğe bağlı olarak SSS'e eklenir (asistan bir dahakine kendisi cevaplar).

export function CompanyQuestionsScreen({ navigation }: Props) {
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(fetchCompanyQuestions);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [addToFaq, setAddToFaq] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HeaderButton
          icon="help-circle-outline"
          label="Sık sorulanlar"
          onPress={() => navigation.navigate('CompanyFaq')}
        />
      ),
    });
  }, [navigation]);

  const startAnswer = useCallback((question: CompanyQuestion) => {
    setOpenId((prev) => (prev === question.id ? null : question.id));
    setDraft(question.answer ?? '');
    setAddToFaq(false);
    setRowError(null);
  }, []);

  const submit = useCallback(
    async (question: CompanyQuestion) => {
      const answer = draft.trim();
      if (!answer) {
        setRowError('Cevap boş olamaz.');
        return;
      }
      setSaving(true);
      setRowError(null);
      try {
        await answerCompanyQuestion(question.id, { answer, addToFaq });
        haptics.success();
        setOpenId(null);
        setDraft('');
        setAddToFaq(false);
        await reload();
      } catch (err) {
        haptics.error();
        setRowError(friendlyMessage(err, 'Cevap gönderilemedi, tekrar deneyin.'));
      } finally {
        setSaving(false);
      }
    },
    [addToFaq, draft, reload]
  );

  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        <SkeletonList variant="conversation" />
      </View>
    );
  }

  // Firması olmayan kullanıcı buraya normalde gelmez (giriş noktası yalnızca
  // kendi firma sayfasında); yine de anlaşılır bir açıklama gösterilir.
  if (status === 'error' && error instanceof ApiError && error.status === 403) {
    return (
      <View style={styles.screen}>
        <EmptyState
          icon="business-outline"
          title="Bu sayfa firmaya bağlı"
          message="Asistanınıza gelen sorular firmanıza gelir. Bir firmaya bağlandığınızda burada görünür."
        />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.screen}>
        <ErrorState error={error} fallback="Sorular alınamadı" onRetry={reload} />
      </View>
    );
  }

  const questions = data?.questions ?? [];
  const open = questions.filter((q) => q.status === 'open');
  const answered = questions.filter((q) => q.status !== 'open');

  const renderOpen = (question: CompanyQuestion, index: number) => {
    const editing = openId === question.id;
    return (
      <View key={question.id} style={[styles.item, index < open.length - 1 && styles.divider]}>
        <Pressable
          onPress={() => startAnswer(question)}
          accessibilityRole="button"
          accessibilityState={{ expanded: editing }}
          accessibilityLabel={`${question.question}, soran ${question.asker.name}${question.asker.company ? `, ${question.asker.company.name}` : ''}. Cevapla`}
          android_ripple={{ color: colors.pressed }}
          style={({ pressed }) => [styles.itemHead, pressed && styles.pressed]}
        >
          <View style={styles.itemTexts}>
            <Text style={styles.question}>{question.question}</Text>
            <Text style={styles.meta}>
              {question.asker.name}
              {question.asker.company ? ` · ${question.asker.company.name}` : ''}
            </Text>
            <View style={styles.metaRow}>
              {question.product ? <Text style={styles.code}>{question.product.code}</Text> : null}
              <Text style={styles.time}>{formatRelativeTime(question.createdAt)}</Text>
            </View>
          </View>
          <Ionicons name={editing ? 'chevron-up' : 'chevron-down'} size={18} color={colors.chevron} />
        </Pressable>

        {editing ? (
          <View style={styles.answerBlock}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              multiline
              autoFocus
              maxLength={1000}
              placeholder="Cevabınızı yazın. Fiyat yazmayın; fiyat yalnızca teklifle gider."
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Cevabınız"
            />
            <Pressable
              onPress={() => {
                haptics.selection();
                setAddToFaq((prev) => !prev);
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: addToFaq }}
              accessibilityLabel="Sık sorulanlara ekle"
              style={({ pressed }) => [styles.checkRow, pressed && styles.pressed]}
            >
              <View style={[styles.checkBox, addToFaq && styles.checkBoxOn]}>
                {addToFaq ? <Ionicons name="checkmark" size={14} color={colors.primaryText} /> : null}
              </View>
              <Text style={styles.checkLabel}>Sık sorulanlara ekle</Text>
            </Pressable>
            {rowError ? <InlineError message={rowError} /> : null}
            <PrimaryButton
              label={saving ? 'Gönderiliyor' : 'Cevabı gönder'}
              onPress={() => void submit(question)}
              disabled={saving}
            />
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl(refreshing, refresh)}
    >
      <Text style={styles.intro}>
        Asistanınız cevabı katalogda bulamadığında soruyu size iletir. Cevabınız alıcının sohbetine düşer;
        sık sorulanlara eklerseniz asistanınız bir dahakine kendisi cevaplar.
      </Text>

      <SectionHeader title="Bekleyen sorular" count={open.length} />
      <View style={styles.block}>
        {open.length ? (
          open.map(renderOpen)
        ) : (
          <EmptyState
            compact
            icon="chatbubble-ellipses-outline"
            title="Bekleyen soru yok"
            message="Alıcılar asistanınıza soru sorduğunda ve cevap katalogda yoksa burada görünür."
          />
        )}
      </View>

      {answered.length ? (
        <>
          <SectionHeader title="Cevaplananlar" count={answered.length} />
          <View style={styles.block}>
            {answered.map((question, index) => (
              <View
                key={question.id}
                style={[styles.item, styles.answeredItem, index < answered.length - 1 && styles.divider]}
              >
                <Text style={styles.answeredQuestion}>{question.question}</Text>
                <Text style={styles.answeredAnswer}>{question.answer}</Text>
                <Text style={styles.meta}>
                  {question.asker.name}
                  {question.product ? ` · ${question.product.code}` : ''} ·{' '}
                  {formatRelativeTime(question.answeredAt ?? question.createdAt)}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
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
  },
  block: { backgroundColor: colors.surface, marginBottom: spacing.blockGap },
  item: { paddingHorizontal: spacing.gutter },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  itemHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH + 16,
    paddingVertical: spacing.sm,
  },
  itemTexts: { flex: 1, gap: 2 },
  pressed: { backgroundColor: colors.pressed },
  question: { ...typography.label, fontFamily: fonts.semibold, color: colors.text },
  meta: { ...typography.caption, color: colors.textMuted },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  code: { ...typography.mono, fontSize: 13, lineHeight: 17, color: colors.primary },
  time: { ...typography.mono, fontSize: 13, lineHeight: 17, color: colors.textMuted },

  answerBlock: { gap: spacing.sm, paddingBottom: spacing.md },
  input: {
    minHeight: 96,
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
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkLabel: { ...typography.label, fontFamily: fonts.regular, color: colors.text },

  answeredItem: { paddingVertical: spacing.sm, gap: 2 },
  answeredQuestion: { ...typography.label, fontFamily: fonts.medium, color: colors.textMuted },
  answeredAnswer: { ...typography.caption, fontSize: 14, lineHeight: 19, color: colors.text },
});
