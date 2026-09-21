import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MainTabScreenProps } from '../../navigation/types';
import {
  ApiError,
  createAssistantThread,
  createWatchRule,
  fetchAssistantGreeting,
  fetchAssistantPersona,
  fetchAssistantThread,
  fetchCompany,
  fetchSkills,
  sendAssistantMessage,
  setAssistantPersona,
  setCompanyMemory,
  type AssistantGreeting,
  type AssistantMemorySuggestion,
  type AssistantMessage,
  type AssistantPersonaKey,
  type AssistantPersonaState,
  type AssistantWatchSuggestion,
} from '../../api/client';
import { AssistantAvatar, type AssistantAvatarState } from '../../components/AssistantAvatar';
import { FALLBACK_PERSONA_OPTIONS, PersonaPicker } from '../../components/PersonaPicker';
import { AssistantResultCard } from '../../components/ResultCard';
import {
  AssistantBubble,
  AssistantComposer,
  ChatDayChip,
  ThinkingBubble,
  UserBubble,
  chatStyles,
  type ComposerChip,
} from '../../components/assistant/ChatParts';
import { RfqCandidatesCard, RfqSummaryCard } from '../../components/assistant/RfqAssistantCards';
import { HeaderButton } from '../../components/HeaderButton';
import { ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
import { SkeletonList } from '../../components/Skeleton';
import { useSession } from '../../context/SessionContext';
import { haptics } from '../../features/haptics';
import { isSameCalendarDay } from '../../features/time';
import { rfqCandidatesView, rfqSummaryView, toolResultView } from '../../features/assistant/toolResult';
import { readAssistantThreadId, writeAssistantThreadId } from '../../features/assistant/threadStore';
import { colors, fonts, radius, spacing, typography } from '../../theme';

type Props = MainTabScreenProps<'AssistantTab'>;

// Sekme ekranı: firma asistanı (Faz 1, Adım 5; taslak docs/tasarim-2027/Asistan.dc.html).
// Sohbet kaydı sunucuda; cihazda yalnızca son sohbetin kimliği durur.
// Asistan kızılı (colors.assistant) yalnızca burada: avatar, gönder düğmesi.
//
// Adım 9: asistanın adı ve yüzü var (İpek / Mert). Seçilmemişse sohbet yerine
// seçim görünümü çıkar; karşılama sunucudan modelsiz gelir ve sohbete YAZILMAZ.

// Beceri sayısı sunucudan gelene kadar gösterilecek değer (bugün 10 beceri).
const FALLBACK_SKILL_COUNT = 10;

// Sohbet balonlarının yanındaki avatar.
const CHAT_AVATAR = 38;
// Yanıt geldikten sonra "anlatıyor"/"sonuç" hali ne kadar kalır.
const AVATAR_FLASH_MS = 2600;

const WELCOME = 'Hesap sor, etiket metni yapıştır ya da kataloğunu sor.';

const EXAMPLES = [
  '220 gr/m² 180 cm süprem, 1.000 metre kaç kilo eder?',
  '30/1 Ne iplik kaç tex?',
  'Kataloğumda elastanlı süprem var mı?',
  '%92 PES %8 EA, 220 gr, 180 cm açık en',
];

// Girdi kutusuna başlangıç metni yazan çipler; kullanıcı düzenleyip gönderir.
const SKILL_CHIPS: { label: string; starter: string }[] = [
  { label: 'İplik çevir', starter: '30/1 Ne iplik kaç tex?' },
  {
    label: 'Üretim hesabı',
    starter: 'Örme üretim hesabı: 2.640 iğne, 24 devir, 96 sistem, 50 iğnede 16 cm iplik, 30/1 Ne.',
  },
  {
    label: 'Kumaş maliyeti',
    starter: 'Kumaş maliyeti çıkar: 30/1 penye süprem, iplik 3,2 USD/kg, örme fasonu 12 TL/kg.',
  },
  {
    label: 'Konfeksiyon maliyeti',
    starter: 'Konfeksiyon maliyeti: adette 1,3 m kumaş, metresi 95 TL, kesim 8 TL, dikim 25 TL.',
  },
  // Faz 2, Adım 1: izleme kuralı önerisi (asistan kurmaz, kart onaylanır).
  { label: 'Ürün izle', starter: 'PA lycra süprem 200 gr üstü çıkınca haber ver' },
  // Faz 2, Adım 5: makine parkına göre fason kapasite araması.
  { label: 'Fason kapasite', starter: '28 fayn 30 pus süprem örecek fason arıyorum' },
  // Faz 2, Adım 6: iplik dizini araması.
  { label: 'İplik ara', starter: '150/48 DTY polyester ipliği kim satıyor?' },
  // Faz 3, Adım 2: çoklu teklif toplama (asistan aday önerir, göndermez).
  { label: 'Teklif topla', starter: 'Şu özellikte kumaş için teklif toplayalım: ' },
];

// Firma adı üst bantta gösteriliyor; oturum boyunca bir kez çekilir.
let cachedCompanyName: string | null = null;

function personaLabel(key: AssistantPersonaKey, state: AssistantPersonaState | null): string {
  const option = state?.options.find((item) => item.key === key);
  if (option) return option.name;
  return key === 'mert' ? 'Mert' : 'İpek';
}

type ChatItem = AssistantMessage & { local?: boolean };

export function AssistantScreen({ navigation }: Props) {
  const { user } = useSession();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [pending, setPending] = useState<ChatItem | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<unknown>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [skillCount, setSkillCount] = useState(FALLBACK_SKILL_COUNT);
  const [companyName, setCompanyName] = useState<string | null>(cachedCompanyName);
  // Hafıza öneri kartının durumu: `${mesajId}:${anahtar}`.
  const [memoryState, setMemoryState] = useState<Record<string, 'saved' | 'dismissed' | 'error'>>({});
  // İzleme öneri kartının durumu: `${mesajId}:${sıra}` (hafıza kartıyla aynı desen).
  const [watchState, setWatchState] = useState<Record<string, 'saved' | 'dismissed' | 'error' | 'limit'>>({});

  // Kişilik: null persona = kullanıcı henüz seçmedi.
  const [persona, setPersona] = useState<AssistantPersonaState | null>(null);
  const [personaReady, setPersonaReady] = useState(false);
  const [savingPersona, setSavingPersona] = useState<AssistantPersonaKey | null>(null);
  const [personaError, setPersonaError] = useState<string | null>(null);
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

  const chosenPersona = persona?.persona ?? null;
  const effectivePersona: AssistantPersonaKey = chosenPersona ?? persona?.effective ?? 'ipek';
  const personaName = personaLabel(effectivePersona, persona);
  const subtitle = companyName ? `${companyName} · ${personaName}` : personaName;

  useLayoutEffect(() => {
    // 2026-09-21: başlık ortak bileşene geçti (profil · "Arama Yap" · zil);
    // "Firma asistanı" başlığı ve altındaki "firma · karakter" satırı oradan
    // kalktı, karşılamada zaten yazıyor. Ekrana özel iki eylem kalıyor.
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <HeaderButton
            icon="settings-outline"
            label="Firma hafızası"
            onPress={() => navigation.navigate('AssistantMemory')}
          />
          <HeaderButton icon="time-outline" label="Sohbetler" onPress={() => navigation.navigate('AssistantThreads')} />
        </View>
      ),
    });
  }, [navigation, subtitle]);

  // Beceri sayısı ve firma adı: ekran başına bir kez, hata sessiz (kozmetik).
  useEffect(() => {
    let cancelled = false;
    fetchSkills()
      .then(({ skills }) => {
        if (!cancelled && skills.length) setSkillCount(skills.length);
      })
      .catch(() => {});
    if (!cachedCompanyName && user?.companyId) {
      fetchCompany(user.companyId)
        .then(({ company }) => {
          cachedCompanyName = company.name;
          if (!cancelled) setCompanyName(company.name);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [user?.companyId]);

  // Kişilik her odakta okunur: "Firma hafızası" ekranından değiştirilmiş olabilir.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchAssistantPersona()
        .then((state) => {
          if (!cancelled) setPersona(state);
        })
        .catch(() => {
          // Sunucuya ulaşılamazsa seçim ekranında kilitlenmeyelim: varsayılanla devam.
          if (!cancelled) {
            setPersona(
              (prev) => prev ?? { persona: 'ipek', effective: 'ipek', options: FALLBACK_PERSONA_OPTIONS }
            );
          }
        })
        .finally(() => {
          if (!cancelled) setPersonaReady(true);
        });
      return () => {
        cancelled = true;
      };
    }, [])
  );

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

  // Karşılama modelsiz ve anında; sohbet kaydına YAZILMAZ, yalnızca gösterilir.
  useEffect(() => {
    if (!chosenPersona) return;
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
  }, [chosenPersona, flashAvatar]);

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

  const scrollToEnd = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const choosePersona = useCallback(async (key: AssistantPersonaKey) => {
    setSavingPersona(key);
    setPersonaError(null);
    try {
      const { persona: saved } = await setAssistantPersona(key);
      haptics.success();
      setPersona((prev) => ({
        persona: saved,
        effective: saved,
        options: prev?.options ?? FALLBACK_PERSONA_OPTIONS,
      }));
      setGreeting(null);
    } catch (err) {
      haptics.error();
      setPersonaError(friendlyMessage(err, 'Seçim kaydedilemedi, tekrar deneyin.'));
    } finally {
      setSavingPersona(null);
    }
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
        retryTextRef.current = '';
        // Hesap kartı varsa avatar "sonuç" halini alır (kart öne çıkar).
        flashAvatar(turn.message.toolCalls.length > 0 ? 'result' : 'speaking');
      } catch (err) {
        haptics.error();
        if (err instanceof ApiError && err.code === 'assistant_not_configured') {
          setSendError('Asistan bu sunucuda etkin değil.');
        } else if (err instanceof ApiError && err.code === 'thread_not_found') {
          // Sohbet arada silinmiş: bir sonraki gönderim yeni sohbet açar.
          threadIdRef.current = null;
          loadedIdRef.current = null;
          void writeAssistantThreadId(null);
          setSendError('Sohbet bulunamadı, tekrar deneyin.');
        } else if (err instanceof ApiError && err.code === 'assistant_failed') {
          setSendError('Asistan yanıt veremedi, tekrar deneyin.');
        } else {
          setSendError(friendlyMessage(err, 'Asistan yanıt veremedi, tekrar deneyin.'));
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
          <View style={chatStyles.assistantRow}>
            <AssistantAvatar
              persona={effectivePersona}
              size={CHAT_AVATAR}
              state={isLast ? avatarState : 'idle'}
              accessibilityLabel={`${personaName}, asistan`}
            />
            <View style={chatStyles.assistantColumn}>
              {item.text ? <AssistantBubble text={item.text} /> : null}
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
      data,
      dismissSuggestion,
      dismissWatchSuggestion,
      effectivePersona,
      memoryState,
      navigation,
      personaName,
      saveSuggestion,
      saveWatchSuggestion,
      watchState,
    ]
  );

  const composerChips: ComposerChip[] = [
    ...SKILL_CHIPS.map((chip) => ({
      label: chip.label,
      onPress: () => applyStarter(chip.starter),
      accessibilityLabel: `${chip.label}, örnek soruyu yaz`,
    })),
    {
      label: 'Tüm hesaplayıcılar',
      icon: 'calculator-outline' as const,
      onPress: () => navigation.navigate('CalculatorsList'),
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

  if (status === 'loading' || !personaReady) {
    return (
      <View style={styles.screen}>
        <SkeletonList variant="chat" />
      </View>
    );
  }

  // Kişilik seçilmeden sohbet açılmaz: uygulama cinsiyet sormaz, yüz seçtirir.
  if (chosenPersona === null) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.chooserContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.chooserTitle} accessibilityRole="header">
          Kim yardımcı olsun?
        </Text>
        <Text style={styles.chooserIntro}>
          Asistanınızın bir adı ve yüzü olsun. İkisi de aynı hesapları yapar, aynı kataloğu bilir; sonra
          değiştirebilirsiniz.
        </Text>
        <PersonaPicker
          options={persona?.options?.length ? persona.options : FALLBACK_PERSONA_OPTIONS}
          value={null}
          onSelect={(key) => void choosePersona(key)}
          busyKey={savingPersona}
          disabled={savingPersona !== null}
          avatarSize={96}
        />
        {personaError ? <InlineError message={personaError} style={styles.chooserError} /> : null}
      </ScrollView>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.screen}>
        <ErrorState error={loadError} fallback="Sohbet alınamadı" onRetry={() => loadThread(threadIdRef.current)} />
      </View>
    );
  }

  const greetingLine = greeting?.text ?? `Merhaba, ben ${personaName}. Ne hesaplayalım?`;

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
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
          onContentSizeChange={scrollToEnd}
          ListEmptyComponent={
            <View>
              <View style={styles.greeting}>
                <AssistantAvatar
                  persona={effectivePersona}
                  size={112}
                  state={avatarState}
                  accessibilityLabel={`${personaName}, asistan`}
                />
                <View style={styles.greetingBubble}>
                  <Text style={styles.assistantText}>{greetingLine}</Text>
                </View>
                <Text style={styles.greetingHint}>
                  {WELCOME} {skillCount} beceri hazır.
                </Text>
              </View>
              <View style={chatStyles.examples}>
                {EXAMPLES.map((example) => (
                  <Pressable
                    key={example}
                    onPress={() => send(example)}
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
                  <AssistantAvatar
                    persona={effectivePersona}
                    size={CHAT_AVATAR}
                    state="thinking"
                    accessibilityLabel={`${personaName} düşünüyor`}
                  />
                  <ThinkingBubble />
                </View>
              ) : null}
              {sendError ? (
                <InlineError
                  message={sendError}
                  onRetry={retryTextRef.current ? () => send(retryTextRef.current) : undefined}
                  style={styles.sendErrorBanner}
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
  if (state === 'dismissed') return null;

  const value = typeof suggestion.value === 'number' ? suggestion.value.toLocaleString('tr-TR') : suggestion.value;

  if (state === 'saved') {
    return (
      <View style={[styles.memoryCard, styles.memorySaved]}>
        <Ionicons name="checkmark-circle" size={18} color={colors.success} />
        <Text style={styles.memorySavedText}>
          Kaydedildi: {suggestion.label} {value}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.memoryCard}>
      <Text style={styles.memoryTitle}>Hafızaya kaydedilsin mi?</Text>
      <Text style={styles.memoryValue}>
        {suggestion.label}: <Text style={styles.memoryValueMono}>{value}</Text>
      </Text>
      <Text style={styles.memoryReason}>{suggestion.reason}</Text>
      {state === 'error' ? <Text style={styles.memoryError}>Kaydedilemedi, tekrar deneyin.</Text> : null}
      <View style={styles.memoryActions}>
        <Pressable
          onPress={onSave}
          accessibilityRole="button"
          accessibilityLabel={`Kaydet: ${suggestion.label} ${value}`}
          style={({ pressed }) => [styles.memoryButton, styles.memorySave, pressed && styles.pressedFade]}
        >
          <Text style={styles.memorySaveText}>Kaydet</Text>
        </Pressable>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Şimdi değil"
          style={({ pressed }) => [styles.memoryButton, styles.memoryDismiss, pressed && styles.chipPressed]}
        >
          <Text style={styles.memoryDismissText}>Şimdi değil</Text>
        </Pressable>
      </View>
    </View>
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
  if (state === 'dismissed') return null;

  if (state === 'saved') {
    return (
      <View style={[styles.memoryCard, styles.memorySaved]}>
        <Ionicons name="checkmark-circle" size={18} color={colors.success} />
        <Text style={styles.memorySavedText}>İzlemeye alındı: {suggestion.name}</Text>
      </View>
    );
  }

  return (
    <View style={styles.memoryCard}>
      <Text style={styles.memoryTitle}>İzleme kurulsun mu?</Text>
      <Text style={styles.memoryValue}>{suggestion.name}</Text>
      <Text style={styles.memoryReason}>{suggestion.reason}</Text>
      {state === 'limit' ? (
        <Text style={styles.memoryError}>İzleme sınırına ulaştınız. Profil {'>'} İzlediklerim listesinden birini silin.</Text>
      ) : null}
      {state === 'error' ? <Text style={styles.memoryError}>İzleme kurulamadı, tekrar deneyin.</Text> : null}
      <View style={styles.memoryActions}>
        <Pressable
          onPress={onSave}
          accessibilityRole="button"
          accessibilityLabel={`İzlemeye al: ${suggestion.name}`}
          style={({ pressed }) => [styles.memoryButton, styles.memorySave, pressed && styles.pressedFade]}
        >
          <Text style={styles.memorySaveText}>İzlemeye al</Text>
        </Pressable>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Şimdi değil"
          style={({ pressed }) => [styles.memoryButton, styles.memoryDismiss, pressed && styles.chipPressed]}
        >
          <Text style={styles.memoryDismissText}>Şimdi değil</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },

  chooserContent: { padding: spacing.gutter, paddingTop: spacing.lg, gap: spacing.sm },
  chooserTitle: { ...typography.heading, color: colors.text, textAlign: 'center' },
  chooserIntro: {
    ...typography.label,
    fontFamily: fonts.regular,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  chooserError: { marginTop: spacing.sm },

  greeting: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.md },
  greetingBubble: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  greetingHint: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },

  assistantText: { ...typography.label, fontFamily: fonts.regular, color: colors.text },
  sendErrorBanner: { marginTop: spacing.sm },
  chipPressed: { backgroundColor: colors.pressed },
  pressedFade: { opacity: 0.85 },

  memoryCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    gap: 4,
  },
  memorySaved: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.successSoft, borderColor: colors.successSoft },
  memorySavedText: { ...typography.caption, fontSize: 14, lineHeight: 19, color: colors.success, flex: 1 },
  memoryTitle: { ...typography.label, fontFamily: fonts.semibold, color: colors.text },
  memoryValue: { ...typography.caption, fontSize: 14, lineHeight: 19, color: colors.text },
  memoryValueMono: { fontFamily: fonts.monoSemibold },
  memoryReason: { ...typography.caption, color: colors.textMuted },
  memoryError: { ...typography.caption, color: colors.danger },
  memoryActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  memoryButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memorySave: { backgroundColor: colors.assistant },
  memorySaveText: { ...typography.caption, fontFamily: fonts.semibold, fontSize: 14, color: colors.primaryText },
  memoryDismiss: { borderWidth: 1, borderColor: colors.borderStrong },
  memoryDismissText: { ...typography.caption, fontFamily: fonts.semibold, fontSize: 14, color: colors.primary },
});
