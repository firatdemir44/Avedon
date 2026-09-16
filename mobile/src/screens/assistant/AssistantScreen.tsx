import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
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
  fetchAssistantThread,
  fetchCompany,
  fetchSkills,
  sendAssistantMessage,
  setCompanyMemory,
  type AssistantMemorySuggestion,
  type AssistantMessage,
} from '../../api/client';
import { AssistantResultCard } from '../../components/ResultCard';
import { HeaderButton } from '../../components/HeaderButton';
import { EmptyState, ErrorState, InlineError, friendlyMessage } from '../../components/StateView';
import { SkeletonList } from '../../components/Skeleton';
import { useSession } from '../../context/SessionContext';
import { haptics } from '../../features/haptics';
import { formatClockTime, formatDayLabel, isSameCalendarDay } from '../../features/time';
import { toolResultView } from '../../features/assistant/toolResult';
import { readAssistantThreadId, writeAssistantThreadId } from '../../features/assistant/threadStore';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

type Props = MainTabScreenProps<'AssistantTab'>;

// Sekme ekranı: firma asistanı (Faz 1, Adım 5; taslak docs/tasarim-2027/Asistan.dc.html).
// Sohbet kaydı sunucuda; cihazda yalnızca son sohbetin kimliği durur.
// Asistan kızılı (colors.assistant) yalnızca burada: avatar ve gönder düğmesi.

// Beceri sayısı sunucudan gelene kadar gösterilecek değer (bugün 10 beceri).
const FALLBACK_SKILL_COUNT = 10;

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
];

// Firma adı üst bantta gösteriliyor; oturum boyunca bir kez çekilir.
let cachedCompanyName: string | null = null;

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

  const threadIdRef = useRef<string | null>(null);
  // undefined: henüz hiç yükleme yapılmadı (ilk odak).
  const loadedIdRef = useRef<string | null | undefined>(undefined);
  const retryTextRef = useRef('');
  const listRef = useRef<FlatList<ChatItem>>(null);
  const inputRef = useRef<TextInput>(null);

  const subtitle = `${companyName ? `${companyName} · ` : ''}${skillCount} beceri`;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitleAlign: 'center',
      headerTitle: () => (
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle} accessibilityRole="header">
            Firma asistanı
          </Text>
          <Text style={styles.headerSubtitle}>{subtitle}</Text>
        </View>
      ),
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

  // Beceri sayısı ve firma adı: ekran başına bir kez, hata sessiz (üst bandın
  // alt satırı kozmetik; yüklenemezse varsayılanla görünür).
  React.useEffect(() => {
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
    [sending]
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

  const data = useMemo<ChatItem[]>(() => (pending ? [...messages, pending] : messages), [messages, pending]);
  const canSend = input.trim().length > 0 && !sending;

  const renderItem = useCallback(
    ({ item, index }: { item: ChatItem; index: number }) => {
      const previous = data[index - 1];
      const startsNewDay =
        !previous || !isSameCalendarDay(new Date(previous.createdAt), new Date(item.createdAt));
      const dayChip = startsNewDay ? (
        <View style={styles.dayChip}>
          <Text style={styles.dayChipText}>{formatDayLabel(item.createdAt)}</Text>
        </View>
      ) : null;

      if (item.role === 'user') {
        return (
          <>
            {dayChip}
            <View style={styles.userBubble}>
              <Text style={styles.userText}>{item.text}</Text>
              <Text style={styles.userTime}>{item.local ? 'Gönderiliyor' : formatClockTime(item.createdAt)}</Text>
            </View>
          </>
        );
      }

      return (
        <>
          {dayChip}
          <View style={styles.assistantRow}>
            <View style={styles.avatar}>
              <Ionicons name="sparkles" size={16} color={colors.primaryText} />
            </View>
            <View style={styles.assistantColumn}>
              {item.text ? (
                <View style={styles.assistantBubble}>
                  <Text style={styles.assistantText}>{item.text}</Text>
                </View>
              ) : null}
              {item.toolCalls.map((call, callIndex) => {
                const view = toolResultView(call);
                return (
                  <AssistantResultCard
                    key={`${item.id}-tool-${callIndex}`}
                    title={view.title}
                    unit={view.unit}
                    rows={view.rows}
                    text={view.text}
                    formula={view.formula}
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
            </View>
          </View>
        </>
      );
    },
    [data, dismissSuggestion, memoryState, saveSuggestion]
  );

  const composer = (
    <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.chipRow}
      >
        {SKILL_CHIPS.map((chip) => (
          <Pressable
            key={chip.label}
            onPress={() => applyStarter(chip.starter)}
            accessibilityRole="button"
            accessibilityLabel={`${chip.label}, örnek soruyu yaz`}
            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
          >
            <Text style={styles.chipText}>{chip.label}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => navigation.navigate('CalculatorsList')}
          accessibilityRole="button"
          accessibilityLabel="Tüm hesaplayıcılar"
          style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
        >
          <Ionicons name="calculator-outline" size={14} color={colors.primary} />
          <Text style={styles.chipText}>Tüm hesaplayıcılar</Text>
        </Pressable>
      </ScrollView>
      <View style={styles.composer}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="Sor, hesaplat, etiket yapıştır..."
          placeholderTextColor={colors.textMuted}
          value={input}
          onChangeText={setInput}
          multiline
          accessibilityLabel="Asistana sorunuz"
        />
        <Pressable
          onPress={() => send(input)}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Gönder"
          accessibilityState={{ disabled: !canSend }}
          style={({ pressed }) => [styles.send, !canSend && styles.sendDisabled, pressed && canSend && styles.pressedFade]}
        >
          <Ionicons name="arrow-up" size={20} color={colors.primaryText} />
        </Pressable>
      </View>
    </View>
  );

  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        <SkeletonList variant="chat" />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.screen}>
        <ErrorState error={loadError} fallback="Sohbet alınamadı" onRetry={() => loadThread(threadIdRef.current)} />
      </View>
    );
  }

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
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={scrollToEnd}
          ListEmptyComponent={
            <View>
              <EmptyState compact icon="sparkles-outline" title="Firma asistanı" message={WELCOME} />
              <View style={styles.examples}>
                {EXAMPLES.map((example) => (
                  <Pressable
                    key={example}
                    onPress={() => send(example)}
                    accessibilityRole="button"
                    accessibilityLabel={`Örnek soru: ${example}`}
                    style={({ pressed }) => [styles.example, pressed && styles.chipPressed]}
                  >
                    <Text style={styles.exampleText}>{example}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
          ListFooterComponent={
            <>
              {sending ? (
                <View style={styles.assistantRow}>
                  <View style={styles.avatar}>
                    <Ionicons name="sparkles" size={16} color={colors.primaryText} />
                  </View>
                  <View style={styles.typingBubble} accessibilityLiveRegion="polite">
                    <ActivityIndicator size="small" color={colors.assistant} />
                    <Text style={styles.typingText}>Hesaplıyor...</Text>
                  </View>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  headerTitleWrap: { alignItems: 'center' },
  headerTitle: { ...typography.subtitle, color: colors.primaryText },
  headerSubtitle: { ...typography.caption, fontSize: 11, lineHeight: 15, color: colors.onPrimaryMuted },
  headerActions: { flexDirection: 'row', alignItems: 'center' },

  listContent: { paddingHorizontal: spacing.gutter, paddingTop: 12, paddingBottom: spacing.md, gap: 12 },
  dayChip: { alignSelf: 'center', backgroundColor: colors.chip, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  dayChipText: { ...typography.caption, fontSize: 11, lineHeight: 15, color: colors.textMuted },

  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  userText: { ...typography.label, fontFamily: fonts.regular, color: colors.primaryText },
  userTime: { fontFamily: fonts.mono, fontSize: 11, lineHeight: 15, color: colors.onPrimaryMuted, textAlign: 'right', marginTop: 4 },

  assistantRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    // Asistan kızılı yalnızca burada ve gönder düğmesinde.
    backgroundColor: colors.assistant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistantColumn: { flex: 1, minWidth: 0, gap: spacing.sm },
  assistantBubble: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  assistantText: { ...typography.label, fontFamily: fonts.regular, color: colors.text },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  typingText: { ...typography.caption, color: colors.textMuted },
  sendErrorBanner: { marginTop: spacing.sm },

  examples: { paddingHorizontal: spacing.xs, gap: spacing.sm },
  example: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: spacing.sm,
  },
  exampleText: { ...typography.label, fontFamily: fonts.regular, color: colors.text },

  footer: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  chipRow: { gap: spacing.sm, paddingHorizontal: spacing.gutter, paddingTop: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTonal,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipPressed: { backgroundColor: colors.pressed },
  chipText: { ...typography.caption, fontFamily: fonts.medium, color: colors.primary },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.gutter,
    paddingTop: 10,
  },
  input: {
    flex: 1,
    minHeight: MIN_TOUCH,
    maxHeight: 120,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTonal,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
  },
  send: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radius.md,
    // Asistan kızılı: gönder düğmesi.
    backgroundColor: colors.assistant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.45 },
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
