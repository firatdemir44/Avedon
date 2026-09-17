import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, KeyboardAvoidingView, Platform, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  fetchAssistantThread,
  openSellerAssistantThread,
  sendAssistantMessage,
  type AssistantMessage,
} from '../../api/client';
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { AssistantResultCard } from '../../components/ResultCard';
import {
  AssistantBubble,
  AssistantComposer,
  ChatDayChip,
  ThinkingBubble,
  UserBubble,
  chatStyles,
} from '../../components/assistant/ChatParts';
import { ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
import { SkeletonList } from '../../components/Skeleton';
import { haptics } from '../../features/haptics';
import { isSameCalendarDay } from '../../features/time';
import { toolResultView } from '../../features/assistant/toolResult';
import { colors, fonts, radius, spacing, typography } from '../../theme';

type Props = RootStackScreenProps<'SellerAssistant'>;

// Satıcı asistanı (Faz 2, Adım 3): alıcı, BAŞKA bir firmanın asistanıyla
// konuşur. Asistan yalnızca o firmanın yayınlanmış kataloğundan ve SSS'inden
// cevap verir, FİYAT VERMEZ (fiyat yalnızca teklifle gider).
//
// Kendi firma asistanından farkları: kişilik seçimi, hafıza/izleme kartları ve
// beceri çipleri BU EKRANDA YOK. Avatar asistan yüzü değil, firma logosudur;
// yanında asistan rengiyle küçük kıvılcım rozeti (renk kuralı: kızıl yalnızca
// asistanın olduğu yerde).

const CHAT_AVATAR = 38;

const INFO =
  'Bu asistan yalnızca firmanın yayınlanmış kataloğundan cevap verir. Fiyat için Teklif iste\'yi kullanın.';

const EXAMPLES = ['Elastanlı tülünüz var mı?', 'MOQ ve termin nedir?', 'OEKO-TEX sertifikalı ürünleriniz hangileri?'];

type ChatItem = AssistantMessage & { local?: boolean };

// Firma logosu + asistan rengi küçük kıvılcım rozeti.
function SellerAvatar({ companyId, companyName }: { companyId: string; companyName: string }) {
  return (
    <View style={styles.avatarWrap}>
      <CompanyAvatar name={companyName} size={CHAT_AVATAR} companyId={companyId} />
      <View style={styles.avatarBadge}>
        <Ionicons name="sparkles" size={9} color={colors.primaryText} />
      </View>
    </View>
  );
}

export function SellerAssistantScreen({ navigation, route }: Props) {
  const { companyId, productCode } = route.params;
  const insets = useSafeAreaInsets();

  const [companyName, setCompanyName] = useState(route.params.companyName ?? '');
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [pending, setPending] = useState<ChatItem | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<unknown>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const threadIdRef = useRef<string | null>(null);
  const retryTextRef = useRef('');
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList<ChatItem>>(null);

  useLayoutEffect(() => {
    // Firma adı bildirimden gelmemiş olabilir: iplik açılınca sunucudan gelir.
    navigation.setOptions({ title: companyName ? `${companyName} asistanı` : 'Firma asistanı' });
  }, [navigation, companyName]);

  const load = useCallback(async () => {
    setStatus('loading');
    setLoadError(null);
    try {
      const { thread, company } = await openSellerAssistantThread(companyId);
      threadIdRef.current = thread.id;
      setCompanyName(company.name);
      const { messages: rows } = await fetchAssistantThread(thread.id);
      setMessages(rows);
      setStatus('ready');
    } catch (err) {
      setLoadError(err);
      setStatus('error');
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      const threadId = threadIdRef.current;
      if (!question || sending || !threadId) return;

      retryTextRef.current = question;
      setInput('');
      setSendError(null);
      setPending({
        id: `local-${Date.now()}`,
        role: 'user',
        text: question,
        toolCalls: [],
        memorySuggestions: [],
        watchSuggestions: [],
        createdAt: new Date().toISOString(),
        local: true,
      });
      setSending(true);
      try {
        const turn = await sendAssistantMessage(threadId, question);
        setMessages((prev) => [...prev, turn.userMessage, turn.message]);
        setPending(null);
        retryTextRef.current = '';
      } catch (err) {
        haptics.error();
        if (err instanceof ApiError && err.code === 'daily_limit') {
          setSendError('Bugünlük soru sınırına ulaştınız.');
          retryTextRef.current = '';
        } else if (err instanceof ApiError && err.code === 'assistant_not_configured') {
          setSendError('Asistan bu sunucuda etkin değil.');
        } else if (err instanceof ApiError && err.code === 'assistant_failed') {
          setSendError('Asistan yanıt veremedi, tekrar deneyin.');
        } else {
          setSendError(friendlyMessage(err, 'Asistan yanıt veremedi, tekrar deneyin.'));
        }
      } finally {
        setSending(false);
      }
    },
    [sending]
  );

  const openProduct = useCallback(
    (productId: string) => navigation.navigate('ProductDetail', { productId }),
    [navigation]
  );

  const data = useMemo<ChatItem[]>(() => (pending ? [...messages, pending] : messages), [messages, pending]);
  const canSend = input.trim().length > 0 && !sending && status === 'ready';

  // Ürün sayfasından gelindiyse ilk öneri o ürünle ilgili olsun.
  const examples = useMemo(
    () => (productCode ? [`${productCode} hakkında bilgi alabilir miyim?`, ...EXAMPLES] : EXAMPLES),
    [productCode]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: ChatItem; index: number }) => {
      const previous = data[index - 1];
      const startsNewDay =
        !previous || !isSameCalendarDay(new Date(previous.createdAt), new Date(item.createdAt));
      const dayChip = startsNewDay ? <ChatDayChip createdAt={item.createdAt} /> : null;

      if (item.role === 'user') {
        return (
          <>
            {dayChip}
            <UserBubble text={item.text} createdAt={item.createdAt} local={item.local} />
          </>
        );
      }

      return (
        <>
          {dayChip}
          <View style={chatStyles.assistantRow}>
            <SellerAvatar companyId={companyId} companyName={companyName} />
            <View style={chatStyles.assistantColumn}>
              {item.text ? <AssistantBubble text={item.text} /> : null}
              {item.toolCalls.map((call, callIndex) => {
                const view = toolResultView(call);
                return (
                  <View key={`${item.id}-tool-${callIndex}`}>
                    <AssistantResultCard
                      title={view.title}
                      unit={view.unit}
                      rows={view.rows}
                      text={view.text}
                      formula={view.formula}
                      onProductPress={call.name === 'katalog_ara' ? openProduct : undefined}
                    />
                    {call.name === 'soruyu_ilet' ? (
                      <View style={styles.forwarded}>
                        <Ionicons name="paper-plane-outline" size={16} color={colors.accent} />
                        <Text style={styles.forwardedText}>
                          Sorunuz firmaya iletildi. Cevap gelince bildirim alacaksınız.
                        </Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        </>
      );
    },
    [companyId, companyName, data, openProduct]
  );

  if (status === 'loading') {
    return (
      <View style={chatStyles.screen}>
        <SkeletonList variant="chat" />
      </View>
    );
  }

  if (status === 'error') {
    const code = loadError instanceof ApiError ? loadError.code : null;
    const fallback =
      code === 'own_company'
        ? 'Kendi firmanızın asistanı için Asistan sekmesini kullanın.'
        : code === 'company_not_found'
          ? 'Firma bulunamadı.'
          : 'Asistan açılamadı';
    return (
      <View style={chatStyles.screen}>
        <ErrorState
          error={code === 'own_company' || code === 'company_not_found' ? null : loadError}
          fallback={fallback}
          onRetry={code === 'own_company' || code === 'company_not_found' ? undefined : () => void load()}
        />
      </View>
    );
  }

  return (
    <View style={chatStyles.screen}>
      <View style={styles.infoStrip}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
        <Text style={styles.infoText}>{INFO}</Text>
      </View>
      <KeyboardAvoidingView
        style={chatStyles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <FlatList
          ref={listRef}
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={chatStyles.listContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View>
              <View style={chatStyles.assistantRow}>
                <SellerAvatar companyId={companyId} companyName={companyName} />
                <View style={chatStyles.assistantColumn}>
                  <AssistantBubble
                    text={`${companyName || 'Bu firma'} kataloğu hakkında sorularınızı yanıtlayayım. Cevabı katalogda bulamazsam sorunuzu firmaya iletirim.`}
                  />
                </View>
              </View>
              <View style={[chatStyles.examples, styles.examplesGap]}>
                {examples.map((example) => (
                  <Pressable
                    key={example}
                    onPress={() => void send(example)}
                    accessibilityRole="button"
                    accessibilityLabel={`Örnek soru: ${example}`}
                    style={({ pressed }) => [chatStyles.example, pressed && chatStyles.examplePressed]}
                  >
                    <Text style={chatStyles.exampleText}>{example}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
          ListFooterComponent={
            <>
              {sending ? (
                <View style={chatStyles.assistantRow}>
                  <SellerAvatar companyId={companyId} companyName={companyName} />
                  <ThinkingBubble label="Katalogda bakıyor..." />
                </View>
              ) : null}
              {sendError ? (
                <InlineError
                  message={sendError}
                  onRetry={retryTextRef.current ? () => void send(retryTextRef.current) : undefined}
                  style={styles.sendErrorBanner}
                />
              ) : null}
            </>
          }
        />
        <AssistantComposer
          inputRef={inputRef}
          value={input}
          onChangeText={setInput}
          onSend={() => void send(input)}
          canSend={canSend}
          placeholder="Kataloğu sorun..."
          accessibilityLabel="Firmanın asistanına sorunuz"
          bottomInset={insets.bottom}
        />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  infoStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surfaceTonal,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
  },
  infoText: { ...typography.caption, color: colors.textMuted, flex: 1 },

  avatarWrap: { width: CHAT_AVATAR, height: CHAT_AVATAR },
  // Asistan kızılı: firma avatarının üstündeki kıvılcım rozeti.
  avatarBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 15,
    height: 15,
    borderRadius: radius.pill,
    backgroundColor: colors.assistant,
    borderWidth: 1,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  examplesGap: { marginTop: spacing.md },
  forwarded: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  forwardedText: { ...typography.caption, fontFamily: fonts.regular, color: colors.text, flex: 1 },
  sendErrorBanner: { marginTop: spacing.sm },
});
