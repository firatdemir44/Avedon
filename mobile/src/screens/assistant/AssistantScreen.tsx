import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MainTabScreenProps } from '../../navigation/types';
import {
  ApiError,
  createAssistantThread,
  createWatchRule,
  fetchAssistantGreeting,
  fetchAssistantThread,
  fetchSkills,
  sendAssistantMessage,
  setCompanyMemory,
  type AssistantGreeting,
  type AssistantMemorySuggestion,
  type AssistantMessage,
  type AssistantWatchSuggestion,
} from '../../api/client';
import { ASSISTANT_DISPLAY_NAME, AssistantAvatar, type AssistantAvatarState } from '../../components/AssistantAvatar';
import { AssistantResultCard } from '../../components/ResultCard';
import {
  AssistantBubble,
  AssistantComposer,
  ChatDayChip,
  ExampleRow,
  ThinkingBubble,
  UserBubble,
  useChatStyles,
  type ComposerChip,
} from '../../components/assistant/ChatParts';
import { RfqCandidatesCard, RfqSummaryCard } from '../../components/assistant/RfqAssistantCards';
import { friendlyMessage } from '../../components/StateView';
import { haptics } from '../../features/haptics';
import { isSameCalendarDay } from '../../features/time';
import { rfqCandidatesView, rfqSummaryView, toolResultView } from '../../features/assistant/toolResult';
import { readAssistantThreadId, writeAssistantThreadId } from '../../features/assistant/threadStore';
import { useTheme } from '../../theme/ThemeContext';
import { consumeVoiceTurn, stopSpeaking, toggleSpeak } from '../../features/speech';
import { AppBar, Button, Card, EmptyState, Icon, Skeleton, SkeletonText } from '../../ui';
import { locale, tr } from '../../i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSession } from '../../context/SessionContext';

const INTRO_KEY = 'takyon.assistant.introSeen';

// Asistanın ilk tanışma konuşması: ne yaptığını birkaç cümlede anlatır (sesli de okunur).
function introText(firstName: string | null | undefined, name: string) {
  return tr(
    'Merhaba{who}, ben {name}. Tekstili bilen, firmanız adına her an çalışan yapay zekâ asistanınızım. Kumaş, iplik ya da boş makine kapasitesi ararım; firmalardan teklif ve numune toplarım. Kumaş, iplik ve konfeksiyon maliyetinizi hesaplar; gramaj, fire, iplik numarası gibi teknik sorularınızı cevaplarım. Ürününüz için yurt dışında hangi ülkelerde alıcı olduğunu bulur, alıcıya özel numune seti hazırlarım. Bana buraya yazabilir ya da mikrofona basıp konuşabilirsiniz. Ne isterseniz söyleyin, birlikte halledelim.',
    { who: firstName ? ' ' + firstName : '', name }
  );
}

type Props = MainTabScreenProps<'AssistantTab'>;

// Sekme ekranı: firma asistanı (Faz 1, Adım 5).
// Sohbet kaydı sunucuda; cihazda yalnızca son sohbetin kimliği durur.
//
// Asistanın tek kimliği "Takyon asistanı", yüzü uygulama simgesi (2026-09-23;
// İpek/Mert seçimi kaldırıldı). Karşılama sunucudan modelsiz gelir ve sohbete YAZILMAZ.
//
// Yeni tasarım (DESIGN.md, 4. adım): ekran kendi `AppBar`ını çiziyor
// (navigation başlığı gizlendi), balonlar marka/yüzey tonlarında, bakır
// (`accent`) yalnızca asistan avatarında. Veri katmanı ve akış değişmedi.

// Beceri sayısı sunucudan gelene kadar gösterilecek değer (bugün 10 beceri).
const FALLBACK_SKILL_COUNT = 10;

// Yanıt geldikten sonra "anlatıyor"/"sonuç" hali ne kadar kalır.
const AVATAR_FLASH_MS = 2600;

const welcomeText = () => tr('Soru sor, kumaş ya da firma arat, etiket fotoğrafı gönder, hesap yaptır.');

const examples = () => [
  tr('220 gr/m² 180 cm süprem, 1.000 metre kaç kilo eder?'),
  tr('30/1 Ne iplik kaç tex?'),
  tr('Kataloğumda elastanlı süprem var mı?'),
  tr('34/28 Terrot 108 sistem müsait makine ara?'),
];

// Girdi kutusuna başlangıç metni yazan çipler; kullanıcı düzenleyip gönderir.
const skillChips = (): { label: string; starter: string }[] => [
  { label: tr('İplik çevir'), starter: tr('30/1 Ne iplik kaç tex?') },
  {
    label: tr('Üretim hesabı'),
    starter: tr('Örme üretim hesabı: 2.640 iğne, 24 devir, 96 sistem, 50 iğnede 16 cm iplik, 30/1 Ne.'),
  },
  {
    label: tr('Kumaş maliyeti'),
    starter: tr('Kumaş maliyeti çıkar: 30/1 penye süprem, iplik 3,2 USD/kg, örme fasonu 12 TL/kg.'),
  },
  {
    label: tr('Konfeksiyon maliyeti'),
    starter: tr('Konfeksiyon maliyeti: adette 1,3 m kumaş, metresi 95 TL, kesim 8 TL, dikim 25 TL.'),
  },
  // Faz 2, Adım 1: izleme kuralı önerisi (asistan kurmaz, kart onaylanır).
  { label: tr('Ürün izle'), starter: tr('PA lycra süprem 200 gr üstü çıkınca haber ver') },
  // Faz 2, Adım 5: makine parkına göre fason kapasite araması.
  { label: tr('Fason kapasite'), starter: tr('28 fayn 30 pus süprem örecek fason arıyorum') },
  // Faz 2, Adım 6: iplik dizini araması.
  { label: tr('İplik ara'), starter: tr('150/48 DTY polyester ipliği kim satıyor?') },
  // Faz 3, Adım 2: çoklu teklif toplama (asistan aday önerir, göndermez).
  { label: tr('Teklif topla'), starter: tr('Şu özellikte kumaş için teklif toplayalım: ') },
];

type ChatItem = AssistantMessage & { local?: boolean };

export function AssistantScreen({ navigation }: Props) {
  const { user } = useSession();
  const t = useTheme();
  const chat = useChatStyles();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [pending, setPending] = useState<ChatItem | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<unknown>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [skillCount, setSkillCount] = useState(FALLBACK_SKILL_COUNT);
  // Hafıza öneri kartının durumu: `${mesajId}:${anahtar}`.
  const [memoryState, setMemoryState] = useState<Record<string, 'saved' | 'dismissed' | 'error'>>({});
  // İzleme öneri kartının durumu: `${mesajId}:${sıra}` (hafıza kartıyla aynı desen).
  const [watchState, setWatchState] = useState<Record<string, 'saved' | 'dismissed' | 'error' | 'limit'>>({});

  const [greeting, setGreeting] = useState<AssistantGreeting | null>(null);
  // Yanıt sonrası avatarın kısa süreli hali.
  const [replyState, setReplyState] = useState<'idle' | 'speaking' | 'result'>('idle');

  const threadIdRef = useRef<string | null>(null);
  // undefined: henüz hiç yükleme yapılmadı (ilk odak).
  const loadedIdRef = useRef<string | null | undefined>(undefined);
  const retryTextRef = useRef('');
  const listRef = useRef<FlatList<ChatItem>>(null);
  const inputRef = useRef<TextInput>(null);
  const replyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageCountRef = useRef(0);

  // Sohbet balonlarının yanındaki avatar (satır yüksekliğiyle uyumlu).
  const chatAvatarSize = t.size.avatar;

  const personaName = tr(ASSISTANT_DISPLAY_NAME);
  const subtitle = personaName;

  // Yeni tasarım: ekran kendi bandını çiziyor, react-navigation başlığı gizli.
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Beceri sayısı: ekran başına bir kez, hata sessiz (kozmetik).
  useEffect(() => {
    let cancelled = false;
    fetchSkills()
      .then(({ skills }) => {
        if (!cancelled && skills.length) setSkillCount(skills.length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const flashAvatar = useCallback((next: 'speaking' | 'result') => {
    if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
    setReplyState(next);
    replyTimerRef.current = setTimeout(() => setReplyState('idle'), AVATAR_FLASH_MS);
  }, []);

  useEffect(
    () => () => {
      if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
    },
    []
  );

  // Karşılama yalnızca sohbet boşken görünür; avatar da o zaman "anlatıyor" olur.
  useEffect(() => {
    messageCountRef.current = messages.length;
  }, [messages.length]);

  // İlk tanışma (Fırat 2026-09-25): asistan ilk kez açıldığında kendini tanıtan daha uzun bir
  // konuşma gösterir ve sesli okur. Cihaz başına bir kez; sonrasında olağan kısa karşılama.
  const [intro, setIntro] = useState(false);
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(INTRO_KEY)
      .then((seen) => {
        if (cancelled || seen || messageCountRef.current > 0) return;
        setIntro(true);
        AsyncStorage.setItem(INTRO_KEY, '1').catch(() => undefined);
        // Sekmeye dokunuş hâlâ "kullanıcı hareketi" sayılırken okumaya başla; tarayıcı izin
        // vermezse metin ekranda kalır, hoparlör simgesiyle dinlenebilir.
        setTimeout(() => toggleSpeak('intro', introText(user?.firstName, personaName)), 300);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Karşılama modelsiz ve anında; sohbet kaydına YAZILMAZ, yalnızca gösterilir.
  useEffect(() => {
    let cancelled = false;
    fetchAssistantGreeting(new Date().getHours())
      .then((data) => {
        if (cancelled) return;
        setGreeting(data);
        if (messageCountRef.current === 0) flashAvatar('speaking');
      })
      .catch(() => {
        if (!cancelled) setGreeting(null);
      });
    return () => {
      cancelled = true;
    };
  }, [flashAvatar]);

  const loadThread = useCallback(async (id: string | null) => {
    setSendError(null);
    setPending(null);
    if (!id) {
      threadIdRef.current = null;
      loadedIdRef.current = null;
      setMessages([]);
      setLoadError(null);
      setStatus('ready');
      return;
    }
    setStatus('loading');
    try {
      const { messages: rows } = await fetchAssistantThread(id);
      threadIdRef.current = id;
      loadedIdRef.current = id;
      setMessages(rows);
      setLoadError(null);
      setStatus('ready');
    } catch (err) {
      // Sohbet silinmişse (başka cihazdan ya da listeden) yeni sohbete düşülür.
      if (err instanceof ApiError && err.status === 404) {
        await writeAssistantThreadId(null);
        threadIdRef.current = null;
        loadedIdRef.current = null;
        setMessages([]);
        setLoadError(null);
        setStatus('ready');
        return;
      }
      setLoadError(err);
      setStatus('error');
    }
  }, []);

  // Sohbet listesi ekranı seçimi cihaza yazıp geri döner; burada odakta okunur.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      readAssistantThreadId().then((stored) => {
        if (cancelled) return;
        if (stored === loadedIdRef.current) return;
        void loadThread(stored);
      });
      return () => {
        cancelled = true;
      };
    }, [loadThread])
  );

  // Başka sekmeye/ekrana geçince sesli okuma susar (Fırat 2026-09-26).
  useFocusEffect(useCallback(() => () => stopSpeaking(), []));

  const scrollToEnd = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || sending) return;

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
        let id = threadIdRef.current;
        if (!id) {
          const { thread } = await createAssistantThread();
          id = thread.id;
          threadIdRef.current = id;
          loadedIdRef.current = id;
          await writeAssistantThreadId(id);
        }
        const turn = await sendAssistantMessage(id, question);
        setMessages((prev) => [...prev, turn.userMessage, turn.message]);
        setPending(null);
        // Soru sesle sorulduysa cevap asistan sesiyle kendiliğinden okunur.
        if (consumeVoiceTurn() && turn.message.text) toggleSpeak(`auto-${turn.message.id}`, turn.message.text);
        retryTextRef.current = '';
        // Hesap kartı varsa avatar "sonuç" halini alır (kart öne çıkar).
        flashAvatar(turn.message.toolCalls.length > 0 ? 'result' : 'speaking');
      } catch (err) {
        haptics.error();
        if (err instanceof ApiError && err.code === 'assistant_not_configured') {
          setSendError(tr('Asistan bu sunucuda etkin değil.'));
        } else if (err instanceof ApiError && err.code === 'thread_not_found') {
          // Sohbet arada silinmiş: bir sonraki gönderim yeni sohbet açar.
          threadIdRef.current = null;
          loadedIdRef.current = null;
          void writeAssistantThreadId(null);
          setSendError(tr('Sohbet bulunamadı, tekrar deneyin.'));
        } else if (err instanceof ApiError && err.code === 'assistant_failed') {
          setSendError(tr('Asistan yanıt veremedi, tekrar deneyin.'));
        } else {
          setSendError(friendlyMessage(err, tr('Asistan yanıt veremedi, tekrar deneyin.')));
        }
      } finally {
        setSending(false);
      }
    },
    [flashAvatar, sending]
  );

  const applyStarter = useCallback((starter: string) => {
    haptics.selection();
    setInput(starter);
    inputRef.current?.focus();
  }, []);

  const saveSuggestion = useCallback(async (messageId: string, suggestion: AssistantMemorySuggestion) => {
    const stateKey = `${messageId}:${suggestion.key}`;
    try {
      await setCompanyMemory(suggestion.key, suggestion.value);
      haptics.success();
      setMemoryState((prev) => ({ ...prev, [stateKey]: 'saved' }));
    } catch {
      haptics.error();
      setMemoryState((prev) => ({ ...prev, [stateKey]: 'error' }));
    }
  }, []);

  const dismissSuggestion = useCallback((messageId: string, suggestion: AssistantMemorySuggestion) => {
    setMemoryState((prev) => ({ ...prev, [`${messageId}:${suggestion.key}`]: 'dismissed' }));
  }, []);

  const saveWatchSuggestion = useCallback(async (stateKey: string, suggestion: AssistantWatchSuggestion) => {
    try {
      await createWatchRule({ name: suggestion.name, query: suggestion.query });
      haptics.success();
      setWatchState((prev) => ({ ...prev, [stateKey]: 'saved' }));
    } catch (err) {
      haptics.error();
      const limit = err instanceof ApiError && err.code === 'too_many_rules';
      setWatchState((prev) => ({ ...prev, [stateKey]: limit ? 'limit' : 'error' }));
    }
  }, []);

  const dismissWatchSuggestion = useCallback((stateKey: string) => {
    setWatchState((prev) => ({ ...prev, [stateKey]: 'dismissed' }));
  }, []);

  const data = useMemo<ChatItem[]>(() => (pending ? [...messages, pending] : messages), [messages, pending]);
  const canSend = input.trim().length > 0 && !sending;

  // Avatarın hali: yazarken dinliyor, beklerken düşünüyor, yanıtta anlatıyor/sonuç.
  const avatarState: AssistantAvatarState = sending
    ? 'thinking'
    : input.trim().length > 0
      ? 'listening'
      : replyState;

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

      // Yalnızca son asistan mesajının avatarı canlı; öncekiler sabit durur.
      const isLast = index === data.length - 1;

      return (
        <>
          {dayChip}
          <View style={chat.assistantRow}>
            <AssistantAvatar
              size={chatAvatarSize}
              state={isLast ? avatarState : 'idle'}
              accessibilityLabel={tr('{name}, asistan', { name: personaName })}
            />
            <View style={chat.assistantColumn}>
              {item.text ? <AssistantBubble text={item.text} createdAt={item.createdAt} /> : null}
              {item.toolCalls.map((call, callIndex) => {
                // Faz 3, Adım 2: teklif araçları satır listesi değil, kendi
                // kartlarını çiziyor (seçim + düğme). Aday yoksa kart çizilmez,
                // asistanın metni yeter.
                if (call.name === 'teklif_topla') {
                  const rfqView = rfqCandidatesView(call);
                  if (!rfqView.candidates.length) return null;
                  return (
                    <RfqCandidatesCard
                      key={`${item.id}-tool-${callIndex}`}
                      view={rfqView}
                      onOpenProduct={(productId) => navigation.navigate('ProductDetail', { productId })}
                      onRequest={(items, request) =>
                        navigation.navigate('RfqForm', {
                          items,
                          prefill: {
                            quantity: request.quantity ?? undefined,
                            unit: request.unit ?? undefined,
                            targetDate: request.targetDate ?? undefined,
                            note: request.note || undefined,
                          },
                        })
                      }
                    />
                  );
                }
                if (call.name === 'teklifleri_ozetle') {
                  const summaryView = rfqSummaryView(call);
                  if (!summaryView) return null;
                  return (
                    <RfqSummaryCard
                      key={`${item.id}-tool-${callIndex}`}
                      view={summaryView}
                      onOpen={(rfqId) => navigation.navigate('RfqCompare', { rfqId })}
                    />
                  );
                }
                const view = toolResultView(call);
                return (
                  <AssistantResultCard
                    key={`${item.id}-tool-${callIndex}`}
                    title={view.title}
                    unit={view.unit}
                    rows={view.rows}
                    text={view.text}
                    formula={view.formula}
                    // Faz 2, Adım 5: kapasite sonucundaki firma satırı firma
                    // sayfasını Makine parkı sekmesiyle açar.
                    // Faz 2, Adım 6: iplik araması satırı iplik sayfasını açar
                    // (katalog satırındaki desenin aynısı).
                    onProductPress={
                      call.name === 'iplik_ara' || call.name === 'katalog_ara'
                        ? (productId) => navigation.navigate('ProductDetail', { productId })
                        : undefined
                    }
                    onCompanyPress={
                      call.name === 'kapasite_ara'
                        ? (companyId) => navigation.navigate('CompanyProfile', { companyId, initialTab: 'machines' })
                        : call.name === 'firma_asistanlarina_sor' || call.name === 'firma_bul'
                          ? (companyId) => navigation.navigate('CompanyProfile', { companyId })
                          : undefined
                    }
                  />
                );
              })}
              {item.memorySuggestions.map((suggestion) => (
                <MemorySuggestionCard
                  key={`${item.id}-mem-${suggestion.key}`}
                  suggestion={suggestion}
                  state={memoryState[`${item.id}:${suggestion.key}`]}
                  onSave={() => saveSuggestion(item.id, suggestion)}
                  onDismiss={() => dismissSuggestion(item.id, suggestion)}
                />
              ))}
              {(item.watchSuggestions ?? []).map((suggestion, watchIndex) => {
                const stateKey = `${item.id}:watch:${watchIndex}`;
                return (
                  <WatchSuggestionCard
                    key={stateKey}
                    suggestion={suggestion}
                    state={watchState[stateKey]}
                    onSave={() => void saveWatchSuggestion(stateKey, suggestion)}
                    onDismiss={() => dismissWatchSuggestion(stateKey)}
                  />
                );
              })}
            </View>
          </View>
        </>
      );
    },
    [
      avatarState,
      chat,
      chatAvatarSize,
      data,
      dismissSuggestion,
      dismissWatchSuggestion,
      memoryState,
      navigation,
      personaName,
      saveSuggestion,
      saveWatchSuggestion,
      watchState,
    ]
  );

  const composerChips: ComposerChip[] = [
    ...skillChips().map((chip) => ({
      label: chip.label,
      onPress: () => applyStarter(chip.starter),
      accessibilityLabel: tr('{label}, örnek soruyu yaz', { label: chip.label }),
    })),
    {
      label: tr('Tüm hesaplayıcılar'),
      icon: 'calculator' as const,
      // Hesap araçları kök yığında geri oklu ekran (2026-09-23).
      onPress: () => navigation.navigate('Calculators'),
    },
  ];

  const composer = (
    <AssistantComposer
      inputRef={inputRef}
      value={input}
      onChangeText={setInput}
      onSend={() => send(input)}
      canSend={canSend}
      bottomInset={insets.bottom}
      chips={composerChips}
    />
  );

  const bar = (
    <AppBar
      title={subtitle}
      // Alt çubukta orta sekme (2026-09-24): sekme ekranında geri oku yok.
      leading="none"
      actions={[
        { icon: 'settings-outline', label: tr('Firma hafızası'), onPress: () => navigation.navigate('AssistantMemory') },
        { icon: 'clock', label: tr('Sohbetler'), onPress: () => navigation.navigate('AssistantThreads') },
      ]}
    />
  );

  if (status === 'loading') {
    return (
      <View style={chat.screen}>
        {bar}
        <View style={{ padding: t.space[4], gap: t.space[4] }}>
          <Skeleton width="60%" height={t.size.control} />
          <SkeletonText lines={3} />
          <Skeleton width="80%" height={t.size.control} />
        </View>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={chat.screen}>
        {bar}
        <EmptyState
          icon="warning"
          title={tr('Sohbet alınamadı')}
          description={friendlyMessage(loadError, tr('Bağlantıyı kontrol edip tekrar deneyin.'))}
          actionLabel={tr('Tekrar dene')}
          onAction={() => void loadThread(threadIdRef.current)}
        />
      </View>
    );
  }

  const greetingLine = intro ? introText(user?.firstName, personaName) : greeting?.text ?? tr('Merhaba, ben {name}. Kumaş ya da iplik bulmak, maliyet hesaplamak, firmalara sormak, ihracat pazarı aramak… Bugün sana nasıl yardımcı olayım?', { name: personaName });

  return (
    <View style={chat.screen}>
      {bar}
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
          onContentSizeChange={scrollToEnd}
          ListEmptyComponent={
            <View style={{ gap: t.space[4] }}>
              <View style={{ alignItems: 'center', gap: t.space[3] }}>
                <AssistantAvatar
                  size={t.size.thumb + t.space[10]}
                  state={avatarState}
                  accessibilityLabel={tr('{name}, asistan', { name: personaName })}
                />
                <View
                  style={{
                    alignSelf: 'stretch',
                    backgroundColor: t.colors.surface1,
                    borderWidth: 1,
                    borderColor: t.colors.line,
                    borderRadius: t.radius.lg,
                    padding: t.space[3],
                    minWidth: 0,
                  }}
                >
                  <Text style={[t.type.body16, { color: t.colors.ink }]}>{greetingLine}</Text>
                </View>
                <Text style={[t.type.body14, { color: t.colors.ink2, textAlign: 'center' }]}>
                  {welcomeText()} {tr('{n} beceri hazır.', { n: skillCount })}
                </Text>
              </View>
              <View style={chat.examples}>
                {examples().map((example) => (
                  <ExampleRow key={example} label={example} onPress={() => send(example)} />
                ))}
              </View>
            </View>
          }
          ListFooterComponent={
            <>
              {sending ? (
                <View style={chat.assistantRow}>
                  <AssistantAvatar
                    size={chatAvatarSize}
                    state="thinking"
                    accessibilityLabel={tr('{name} düşünüyor', { name: personaName })}
                  />
                  <ThinkingBubble />
                </View>
              ) : null}
              {sendError ? (
                <ErrorBanner
                  message={sendError}
                  onRetry={retryTextRef.current ? () => send(retryTextRef.current) : undefined}
                />
              ) : null}
            </>
          }
        />
        {composer}
      </KeyboardAvoidingView>
    </View>
  );
}

// Sohbet içi hata şeridi (eski InlineError'ın token'lı karşılığı).
function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
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
        marginTop: t.space[2],
        minWidth: 0,
      }}
    >
      <Icon name="warning" size={t.size.iconSm} color="danger" />
      <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{message}</Text>
      {onRetry ? <Button kind="quiet" label={tr('Tekrar dene')} onPress={onRetry} /> : null}
    </View>
  );
}

// "Hafızaya kaydedilsin mi?" kartı: asistan hafızaya kendisi YAZMAZ, önerir.
function MemorySuggestionCard({
  suggestion,
  state,
  onSave,
  onDismiss,
}: {
  suggestion: AssistantMemorySuggestion;
  state?: 'saved' | 'dismissed' | 'error';
  onSave: () => void;
  onDismiss: () => void;
}) {
  const t = useTheme();
  if (state === 'dismissed') return null;

  const value = typeof suggestion.value === 'number' ? suggestion.value.toLocaleString(locale()) : suggestion.value;

  if (state === 'saved') {
    return <SavedCard text={tr('Kaydedildi: {label} {value}', { label: suggestion.label, value })} />;
  }

  return (
    <Card style={{ gap: t.space[2] }}>
      <Text style={[t.type.title18, { color: t.colors.ink }]}>{tr('Hafızaya kaydedilsin mi?')}</Text>
      <Text style={[t.type.body16, { color: t.colors.ink }]}>
        {suggestion.label}: <Text style={t.type.mono14}>{value}</Text>
      </Text>
      <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{suggestion.reason}</Text>
      {state === 'error' ? (
        <Text style={[t.type.body14, { color: t.colors.danger }]}>{tr('Kaydedilemedi, tekrar deneyin.')}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: t.space[2], minWidth: 0 }}>
        <Button
          kind="secondary"
          label={tr('Kaydet')}
          onPress={onSave}
          accessibilityLabel={tr('Kaydet: {label} {value}', { label: suggestion.label, value })}
          style={{ flex: 1 }}
        />
        <Button kind="quiet" label={tr('Şimdi değil')} onPress={onDismiss} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

// "İzleme kurulsun mu?" kartı (Faz 2, Adım 1): hafıza kartının aynısı —
// asistan izlemeyi kendisi KURMAZ, kullanıcı onaylar.
function WatchSuggestionCard({
  suggestion,
  state,
  onSave,
  onDismiss,
}: {
  suggestion: AssistantWatchSuggestion;
  state?: 'saved' | 'dismissed' | 'error' | 'limit';
  onSave: () => void;
  onDismiss: () => void;
}) {
  const t = useTheme();
  if (state === 'dismissed') return null;

  if (state === 'saved') {
    return <SavedCard text={tr('İzlemeye alındı: {name}', { name: suggestion.name })} />;
  }

  return (
    <Card style={{ gap: t.space[2] }}>
      <Text style={[t.type.title18, { color: t.colors.ink }]}>{tr('İzleme kurulsun mu?')}</Text>
      <Text style={[t.type.body16, { color: t.colors.ink }]}>{suggestion.name}</Text>
      <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{suggestion.reason}</Text>
      {state === 'limit' ? (
        <Text style={[t.type.body14, { color: t.colors.danger }]}>
          {tr('İzleme sınırına ulaştınız. Profil > İzlediklerim listesinden birini silin.')}
        </Text>
      ) : null}
      {state === 'error' ? (
        <Text style={[t.type.body14, { color: t.colors.danger }]}>{tr('İzleme kurulamadı, tekrar deneyin.')}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: t.space[2], minWidth: 0 }}>
        <Button
          kind="secondary"
          label={tr('İzlemeye al')}
          onPress={onSave}
          accessibilityLabel={tr('İzlemeye al: {name}', { name: suggestion.name })}
          style={{ flex: 1 }}
        />
        <Button kind="quiet" label={tr('Şimdi değil')} onPress={onDismiss} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

// Onaylanmış öneri: yeşil zeminli tek satır (ikon + metin).
function SavedCard({ text }: { text: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space[2],
        padding: t.space[3],
        borderRadius: t.radius.lg,
        backgroundColor: t.colors.successSoft,
        minWidth: 0,
      }}
    >
      <Icon name="check" size={t.size.iconSm} color="success" />
      <Text style={[t.type.body14, { color: t.colors.success, flex: 1, minWidth: 0 }]}>{text}</Text>
    </View>
  );
}
