import React, { useCallback, useLayoutEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  createCompanyFaq,
  deleteCompanyFaq,
  fetchCompanyFaqs,
  updateCompanyFaq,
  type CompanyFaq,
} from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { useRefreshControl } from '../../components/refresh';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { useFocusLoad } from '../../features/useFocusLoad';
import { useTheme } from '../../theme/ThemeContext';
import { useBottomPadding, AppBar, Button, Card, EmptyState, Icon, Input, Screen, SectionTitle, SkeletonRow } from '../../ui';

type Props = RootStackScreenProps<'CompanyFaq'>;

// Firmanın sık sorulanları (Faz 2, Adım 3): satıcı asistanı alıcı sorularını
// önce katalogdan, sonra bu cevaplardan yanıtlar. FİYAT YAZILMAZ; fiyat
// yalnızca teklifle gider.
//
// Yeni tasarım (DESIGN.md, 4. adım): kendi `AppBar`ı (navigation başlığı
// gizlendi), `Screen` iskeleti, form `Input` + `Button`. Akış değişmedi.

// "new": yeni kayıt formu açık.
type EditingId = string | 'new' | null;

export function CompanyFaqScreen({ navigation }: Props) {
  const t = useTheme();
  const bottomPad = useBottomPadding();
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(fetchCompanyFaqs);
  const [editing, setEditing] = useState<EditingId>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const refreshCtl = useRefreshControl(refreshing, refresh);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

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

  const bar = <AppBar title="Sık sorulanlar" leading="back" onBack={() => navigation.goBack()} />;

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

  if (status === 'error' && error instanceof ApiError && error.status === 403) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar}
        <Screen>
          <EmptyState
            icon="business-outline"
            title="Sık sorulanlar firmaya bağlı"
            description="Bu cevapları asistanınız alıcılara verir. Bir firmaya bağlandığınızda burada düzenlersiniz."
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
            title="Sık sorulanlar alınamadı"
            description={friendlyMessage(error, 'Bağlantıyı kontrol edip tekrar deneyin.')}
            actionLabel="Tekrar dene"
            onAction={reload}
          />
        </Screen>
      </View>
    );
  }

  const faqs = data?.faqs ?? [];

  const form = (
    <Card style={{ gap: t.space[3] }}>
      <Input
        label="Soru"
        value={question}
        onChangeText={setQuestion}
        multiline
        maxLength={300}
        placeholder="Örn: En küçük sipariş miktarınız nedir?"
        accessibilityLabel="Soru"
      />
      <Input
        label="Cevap"
        value={answer}
        onChangeText={setAnswer}
        multiline
        maxLength={1000}
        error={formError}
        placeholder="Örn: Örme kumaşlarda 300 kg, dokumada 1.000 metre."
        accessibilityLabel="Cevap"
      />
      <View style={{ flexDirection: 'row', gap: t.space[2], minWidth: 0 }}>
        <Button label="Kaydet" loading={saving} onPress={() => void save()} style={{ flex: 1 }} />
        <Button kind="secondary" label="Vazgeç" disabled={saving} onPress={cancel} style={{ flex: 1 }} />
      </View>
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      {bar}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: t.space[4],
          paddingBottom: bottomPad,
          paddingHorizontal: t.space[4],
          gap: t.space[6],
          alignItems: 'center',
        }}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshCtl}
      >
        <View style={{ width: '100%', maxWidth: t.size.maxContentWidth, gap: t.space[6], minWidth: 0 }}>
          <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
            Asistanınız alıcı sorularını bu cevaplara göre yanıtlar. Fiyat yazmayın; fiyat yalnızca teklifle gider.
          </Text>

          {editing === 'new' ? (
            <View style={{ gap: t.space[3] }}>
              <SectionTitle title="Yeni soru" />
              {form}
            </View>
          ) : (
            <Button
              kind="secondary"
              icon="plus"
              label="Yeni soru ekle"
              fullWidth
              onPress={startNew}
              accessibilityLabel="Yeni sık sorulan ekle"
            />
          )}

          <View style={{ gap: t.space[3] }}>
            <SectionTitle title={`Sık sorulanlar (${faqs.length})`} />
            {faqs.length ? (
              faqs.map((faq) => {
                if (editing === faq.id) {
                  return (
                    <View key={faq.id} style={{ gap: t.space[3] }}>
                      {form}
                      <Button
                        kind="danger"
                        label="Sil"
                        icon="trash-outline"
                        onPress={() => void remove(faq)}
                      />
                    </View>
                  );
                }
                return (
                  <View
                    key={faq.id}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minWidth: 0 }}
                  >
                    {/* Çöp ikonu satırın YANINDA: web'de iç içe düğme olmasın. */}
                    <Pressable
                      onPress={() => startEdit(faq)}
                      accessibilityRole="button"
                      accessibilityLabel={`${faq.question}. Düzenle`}
                      style={({ pressed }) => ({
                        flex: 1,
                        minWidth: 0,
                        gap: t.space[1] / 2,
                        minHeight: t.size.touchMin,
                        justifyContent: 'center',
                        paddingVertical: t.space[2],
                        backgroundColor: pressed ? t.colors.surface2 : 'transparent',
                      })}
                    >
                      <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>{faq.question}</Text>
                      <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{faq.answer}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void remove(faq)}
                      accessibilityRole="button"
                      accessibilityLabel={`Sil: ${faq.question}`}
                      hitSlop={t.space[2]}
                      style={({ pressed }) => ({
                        width: t.size.touchMin,
                        height: t.size.touchMin,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.6 : 1,
                      })}
                    >
                      <Icon name="trash-outline" size={t.size.iconSm} color="danger" />
                    </Pressable>
                  </View>
                );
              })
            ) : (
              <EmptyState
                icon="help-circle-outline"
                title="Henüz sık sorulan yok"
                description="MOQ, termin, sertifika ve numune koşullarınızı yazarsanız asistanınız bunları kendisi cevaplar."
                actionLabel="Yeni soru ekle"
                onAction={startNew}
              />
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
