import React, { useCallback, useLayoutEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  answerCompanyQuestion,
  fetchCompanyQuestions,
  type CompanyQuestion,
} from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { useRefreshControl } from '../../components/refresh';
import { haptics } from '../../features/haptics';
import { formatRelativeTime } from '../../features/time';
import { useFocusLoad } from '../../features/useFocusLoad';
import { useTheme } from '../../theme/ThemeContext';
import { AppBar, Button, Card, EmptyState, Icon, Input, Screen, SectionTitle, SkeletonRow } from '../../ui';

type Props = RootStackScreenProps<'CompanyQuestions'>;

// Satıcı tarafı (Faz 2, Adım 3): asistan alıcının sorusunu katalogda
// bulamazsa firmaya iletir; burada cevaplanır. Cevap alıcının sohbetine düşer
// ve isteğe bağlı olarak SSS'e eklenir (asistan bir dahakine kendisi cevaplar).
//
// Yeni tasarım (DESIGN.md, 4. adım): kendi `AppBar`ı (navigation başlığı
// gizlendi), `Screen` iskeleti, cevap formu `Input` + `Button`. Akış değişmedi.

export function CompanyQuestionsScreen({ navigation }: Props) {
  const t = useTheme();
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(fetchCompanyQuestions);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [addToFaq, setAddToFaq] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const refreshCtl = useRefreshControl(refreshing, refresh);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
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

  const bar = (
    <AppBar
      title="Asistana gelen sorular"
      leading="back"
      onBack={() => navigation.goBack()}
      actions={[
        {
          icon: 'help-circle-outline',
          label: 'Sık sorulanlar',
          onPress: () => navigation.navigate('CompanyFaq'),
        },
      ]}
    />
  );

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar}
        <Screen>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </Screen>
      </View>
    );
  }

  // Firması olmayan kullanıcı buraya normalde gelmez (giriş noktası yalnızca
  // kendi firma sayfasında); yine de anlaşılır bir açıklama gösterilir.
  if (status === 'error' && error instanceof ApiError && error.status === 403) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar}
        <Screen>
          <EmptyState
            icon="business-outline"
            title="Bu sayfa firmaya bağlı"
            description="Asistanınıza gelen sorular firmanıza gelir. Bir firmaya bağlandığınızda burada görünür."
          />
        </Screen>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar}
        <Screen>
          <EmptyState
            icon="warning"
            title="Sorular alınamadı"
            description={friendlyMessage(error, 'Bağlantıyı kontrol edip tekrar deneyin.')}
            actionLabel="Tekrar dene"
            onAction={reload}
          />
        </Screen>
      </View>
    );
  }

  const questions = data?.questions ?? [];
  const open = questions.filter((q) => q.status === 'open');
  const answered = questions.filter((q) => q.status !== 'open');

  const renderOpen = (question: CompanyQuestion) => {
    const editing = openId === question.id;
    return (
      <Card key={question.id} style={{ gap: t.space[3] }}>
        <Pressable
          onPress={() => startAnswer(question)}
          accessibilityRole="button"
          accessibilityState={{ expanded: editing }}
          accessibilityLabel={`${question.question}, soran ${question.asker.name}${question.asker.company ? `, ${question.asker.company.name}` : ''}. Cevapla`}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.space[2],
            minHeight: t.size.touchMin,
            minWidth: 0,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <View style={{ flex: 1, minWidth: 0, gap: t.space[1] / 2 }}>
            <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>{question.question}</Text>
            <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
              {question.asker.name}
              {question.asker.company ? ` · ${question.asker.company.name}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minWidth: 0 }}>
              {question.product ? (
                <Text style={[t.type.mono14, { color: t.colors.brand }]}>{question.product.code}</Text>
              ) : null}
              <Text style={[t.type.caption12, { color: t.colors.ink3 }]}>
                {formatRelativeTime(question.createdAt)}
              </Text>
            </View>
          </View>
          <Icon name={editing ? 'chevron-up-outline' : 'chevron-down-outline'} size={t.size.iconSm} color="ink3" />
        </Pressable>

        {editing ? (
          <View style={{ gap: t.space[3] }}>
            <Input
              label="Cevabınız"
              value={draft}
              onChangeText={setDraft}
              error={rowError}
              multiline
              autoFocus
              maxLength={1000}
              placeholder="Cevabınızı yazın. Fiyat yazmayın; fiyat yalnızca teklifle gider."
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
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.space[2],
                minHeight: t.size.touchMin,
                minWidth: 0,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Icon
                name={addToFaq ? 'checkbox-outline' : 'square-outline'}
                size={t.size.iconSm}
                color={addToFaq ? 'brand' : 'lineStrong'}
              />
              <Text style={[t.type.body16, { color: t.colors.ink, flex: 1, minWidth: 0 }]}>
                Sık sorulanlara ekle
              </Text>
            </Pressable>
            <Button label="Cevabı gönder" loading={saving} fullWidth onPress={() => void submit(question)} />
          </View>
        ) : null}
      </Card>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      {bar}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: t.space[4],
          paddingBottom: t.space[10],
          paddingHorizontal: t.space[4],
          alignItems: 'center',
        }}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshCtl}
      >
        <View style={{ width: '100%', maxWidth: t.size.maxContentWidth, gap: t.space[6], minWidth: 0 }}>
          <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
            Asistanınız cevabı katalogda bulamadığında soruyu size iletir. Cevabınız alıcının sohbetine düşer; sık
            sorulanlara eklerseniz asistanınız bir dahakine kendisi cevaplar.
          </Text>

          <View style={{ gap: t.space[3] }}>
            <SectionTitle title={`Bekleyen sorular (${open.length})`} />
            {open.length ? (
              open.map(renderOpen)
            ) : (
              <EmptyState
                icon="messages"
                title="Bekleyen soru yok"
                description="Alıcılar asistanınıza soru sorduğunda ve cevap katalogda yoksa burada görünür."
              />
            )}
          </View>

          {answered.length ? (
            <View style={{ gap: t.space[3] }}>
              <SectionTitle title={`Cevaplananlar (${answered.length})`} />
              {answered.map((question) => (
                <Card key={question.id} style={{ gap: t.space[1] }}>
                  <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{question.question}</Text>
                  <Text style={[t.type.body16, { color: t.colors.ink }]}>{question.answer}</Text>
                  <Text style={[t.type.body14, { color: t.colors.ink3 }]}>
                    {question.asker.name}
                    {question.product ? ` · ${question.product.code}` : ''} ·{' '}
                    {formatRelativeTime(question.answeredAt ?? question.createdAt)}
                  </Text>
                </Card>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
