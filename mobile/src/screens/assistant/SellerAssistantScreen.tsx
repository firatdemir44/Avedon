import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  AppState,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
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
  ExampleRow,
  ThinkingBubble,
  UserBubble,
  useChatStyles,
} from '../../components/assistant/ChatParts';
import { friendlyMessage } from '../../components/StateView';
import { haptics } from '../../features/haptics';
import { isSameCalendarDay } from '../../features/time';
import { toolResultView } from '../../features/assistant/toolResult';
import { useTheme } from '../../theme/ThemeContext';
import { AppBar, Button, EmptyState, Icon, Skeleton, SkeletonText } from '../../ui';

type Props = RootStackScreenProps<'SellerAssistant'>;

// Satıcı asistanı (Faz 2, Adım 3): alıcı, BAŞKA bir firmanın asistanıyla
// konuşur. Asistan yalnızca o firmanın yayınlanmış kataloğundan ve SSS'inden
// cevap verir, FİYAT VERMEZ (fiyat yalnızca teklifle gider).
//
// Kendi firma asistanından farkları: kişilik seçimi, hafıza/izleme kartları ve
// beceri çipleri BU EKRANDA YOK. Avatar asistan yüzü değil, firma logosudur;
// yanında bakır (accent) küçük kıvılcım rozeti — bakır yalnızca asistanın
// olduğu yerde.
//
// Yeni tasarım (DESIGN.md, 4. adım): ekran kendi `AppBar`ını çiziyor
// (navigation başlığı gizlendi). Veri katmanı, yoklama ve akış değişmedi.

// Satıcı cevabı ipliğe sunucuda ekleniyor; açık ekran kendi kendine tazelensin
// (Mesajlar ekranındaki yoklama kalıbı).
const POLL_INTERVAL_MS = 10000;
const NEAR_BOTTOM_THRESHOLD_PX = 80;

const INFO =
  'Bu asistan yalnızca firmanın yayınlanmış kataloğundan cevap verir. Fiyat için Teklif iste\'yi kullanın.';

const EXAMPLES = ['Elastanlı tülünüz var mı?', 'MOQ ve termin nedir?', 'OEKO-TEX sertifikalı ürünleriniz hangileri?'];

type ChatItem = AssistantMessage & { local?: boolean };

// Firma logosu + bakır kıvılcım rozeti.
function SellerAvatar({ companyId, companyName }: { companyId: string; companyName: string }) {
  const t = useTheme();
  const size = t.size.avatar;
  const badge = t.size.iconXs;
  return (
    <View style={{ width: size, height: size }}>
      <CompanyAvatar name={companyName} size={size} companyId={companyId} />
      <View
        style={{
          position: 'absolute',
          right: -t.space[1] / 2,
          bottom: -t.space[1] / 2,
          width: badge,
          height: badge,
          borderRadius: t.radius.full,
          backgroundColor: t.colors.accent,
          borderWidth: 1,
          borderColor: t.colors.surface1,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      />
    </View>
  );
}

export function SellerAssistantScreen({ navigation, route }: Props) {
  const t = useTheme();
  const chat = useChatStyles();
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
  const messagesRef = useRef<ChatItem[]>([]);
  messagesRef.current = messages;
  const sendingRef = useRef(false);
  sendingRef.current = sending;
  const pollInFlightRef = useRef(false);
  // Kullanıcı yukarı kaydırdıysa yeni mesaj gelince liste zıplamasın.
  const isNearBottomRef = useRef(true);

  // Yeni tasarım: başlık ekranın kendi bandında (firma adıyla).
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

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

  // Sessiz yoklama: yeni mesaj yoksa state'e dokunulmaz (liste zıplamasın);
  // gönderim sürerken ve uygulama ön planda değilken istek atılmaz.
  const poll = useCallback(async () => {
    const threadId = threadIdRef.current;
    if (!threadId || pollInFlightRef.current || sendingRef.current) return;
    if (AppState.currentState !== 'active') return;

    pollInFlightRef.current = true;
    try {
      const { messages: rows } = await fetchAssistantThread(threadId);
      const prev = messagesRef.current;
      const unchanged =
        prev.length === rows.length && (rows.length === 0 || prev[prev.length - 1]?.id === rows[rows.length - 1]?.id);
      if (unchanged) return;
      setMessages(rows);
      if (isNearBottomRef.current) {
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
      }
    } catch {
      // Geçici ağ hatası: bir sonraki turda tekrar denenecek.
    } finally {
      pollInFlightRef.current = false;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
      return () => clearInterval(timer);
    }, [poll])
  );

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

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    isNearBottomRef.current =
      layoutMeasurement.height + contentOffset.y >= contentSize.height - NEAR_BOTTOM_THRESHOLD_PX;
  };

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
          <View style={chat.assistantRow}>
            <SellerAvatar companyId={companyId} companyName={companyName} />
            <View style={chat.assistantColumn}>
              {item.text ? <AssistantBubble text={item.text} createdAt={item.createdAt} /> : null}
              {item.toolCalls.map((call, callIndex) => {
                const view = toolResultView(call);
                return (
                  <View key={`${item.id}-tool-${callIndex}`} style={{ gap: t.space[2], minWidth: 0 }}>
                    <AssistantResultCard
                      title={view.title}
                      unit={view.unit}
                      rows={view.rows}
                      text={view.text}
                      formula={view.formula}
                      onProductPress={call.name === 'katalog_ara' ? openProduct : undefined}
                    />
                    {call.name === 'soruyu_ilet' ? (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'flex-start',
                          gap: t.space[2],
                          backgroundColor: t.colors.accentSoft,
                          borderRadius: t.radius.lg,
                          padding: t.space[3],
                          minWidth: 0,
                        }}
                      >
                        <Icon name="paper-plane-outline" size={t.size.iconSm} color="accent" />
                        <Text style={[t.type.body14, { color: t.colors.ink, flex: 1, minWidth: 0 }]}>
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
    [chat, companyId, companyName, data, openProduct, t]
  );

  const bar = (
    <AppBar
      title={companyName ? `${companyName} asistanı` : 'Firma asistanı'}
      leading="back"
      onBack={() => navigation.goBack()}
    />
  );

  if (status === 'loading') {
    return (
      <View style={chat.screen}>
        {bar}
        <View style={{ padding: t.space[4], gap: t.space[4] }}>
          <Skeleton width="70%" height={t.size.control} />
          <SkeletonText lines={3} />
        </View>
      </View>
    );
  }

  if (status === 'error') {
    const code = loadError instanceof ApiError ? loadError.code : null;
    const known = code === 'own_company' || code === 'company_not_found';
    const fallback =
      code === 'own_company'
        ? 'Kendi firmanızın asistanı için Asistan sekmesini kullanın.'
        : code === 'company_not_found'
          ? 'Firma bulunamadı.'
          : 'Asistan açılamadı';
    return (
      <View style={chat.screen}>
        {bar}
        <EmptyState
          icon="warning"
          title={known ? fallback : 'Asistan açılamadı'}
          description={known ? undefined : friendlyMessage(loadError, 'Bağlantıyı kontrol edip tekrar deneyin.')}
          actionLabel={known ? undefined : 'Tekrar dene'}
          onAction={known ? undefined : () => void load()}
        />
      </View>
    );
  }

  return (
    <View style={chat.screen}>
      {bar}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: t.space[2],
          backgroundColor: t.colors.surface1,
          borderBottomWidth: 1,
          borderBottomColor: t.colors.line,
          paddingHorizontal: t.space[4],
          paddingVertical: t.space[2],
          minWidth: 0,
        }}
      >
        <Icon name="info" size={t.size.iconSm} color="ink3" />
        <Text style={[t.type.body14, { color: t.colors.ink2, flex: 1, minWidth: 0 }]}>{INFO}</Text>
      </View>
      <KeyboardAvoidingView
        style={chat.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={t.size.tabbar + t.space[4]}
      >
        <FlatList
          ref={listRef}
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={chat.listContent}
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          scrollEventThrottle={100}
          onContentSizeChange={() => {
            if (isNearBottomRef.current) listRef.current?.scrollToEnd({ animated: true });
          }}
          ListEmptyComponent={
            <View style={{ gap: t.space[4] }}>
              <View style={chat.assistantRow}>
                <SellerAvatar companyId={companyId} companyName={companyName} />
                <View style={chat.assistantColumn}>
                  <AssistantBubble
                    text={`${companyName || 'Bu firma'} kataloğu hakkında sorularınızı yanıtlayayım. Cevabı katalogda bulamazsam sorunuzu firmaya iletirim.`}
                  />
                </View>
              </View>
              <View style={chat.examples}>
                {examples.map((example) => (
                  <ExampleRow key={example} label={example} onPress={() => void send(example)} />
                ))}
              </View>
            </View>
          }
          ListFooterComponent={
            <>
              {sending ? (
                <View style={chat.assistantRow}>
                  <SellerAvatar companyId={companyId} companyName={companyName} />
                  <ThinkingBubble label="Katalogda bakıyor..." />
                </View>
              ) : null}
              {sendError ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: t.space[2],
                    padding: t.space[3],
                    borderRadius: t.radius.md,
                    backgroundColor: t.colors.dangerSoft,
                    marginTop: t.space[2],
                    minWidth: 0,
                  }}
                >
                  <Icon name="warning" size={t.size.iconSm} color="danger" />
                  <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{sendError}</Text>
                  {retryTextRef.current ? (
                    <Button kind="quiet" label="Tekrar dene" onPress={() => void send(retryTextRef.current)} />
                  ) : null}
                </View>
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
