import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  AppState,
  Platform,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { useSession } from '../../context/SessionContext';
import {
  fetchMessages,
  markConversationRead,
  sendMessage,
  type ChatMessage,
} from '../../api/client';
import { formatClockTime, formatDayLabel, isSameCalendarDay } from '../../features/time';
import { haptics } from '../../features/haptics';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState, ErrorState, InlineError } from '../../components/StateView';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

type LocalMessage = ChatMessage & { pending?: boolean; failed?: boolean };

const POLL_INTERVAL_MS = 4000;
const NEAR_BOTTOM_THRESHOLD_PX = 80;

// Sunucu `since` filtresinde gte kullanıyor (aynı milisaniyedeki mesajlar
// kaçmasın diye), dolayısıyla gelen listede zaten bildiğimiz kayıtlar olabilir.
// Id'ye göre birleştirip iyimser (temp-) kayıtları gerçekleriyle değiştiriyoruz.
function mergeMessages(prev: LocalMessage[], incoming: ChatMessage[]): LocalMessage[] {
  if (incoming.length === 0) return prev;

  const arrived = new Set(incoming.map((m) => `${m.senderId}|${m.body}`));
  const byId = new Map<string, LocalMessage>();

  for (const message of prev) {
    const isSupersededOptimistic = message.id.startsWith('temp-') && arrived.has(`${message.senderId}|${message.body}`);
    if (!isSupersededOptimistic) byId.set(message.id, message);
  }
  for (const message of incoming) {
    byId.set(message.id, message);
  }

  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function newestServerTimestamp(messages: ChatMessage[]): string | null {
  let newest: string | null = null;
  for (const message of messages) {
    if (message.id.startsWith('temp-')) continue;
    if (!newest || message.createdAt > newest) newest = message.createdAt;
  }
  return newest;
}

// Taslak: docs/tasarim-yonleri/CSohbet.dc.html. Gün ayraç çipi, gönderen tarafı
// sivri köşeli baloncuklar, eşit aralıklı saat; altta yazma alanı + kare gönder.
export function ChatScreen({ navigation, route }: Props) {
  const { conversationId } = route.params;
  const { user } = useSession();
  const insets = useSafeAreaInsets();
  const meId = user?.id ?? '';

  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // İlk yükleme hatası ayrı: mesaj gönderme hatası sohbeti kapatmamalı, ama
  // hiç mesaj gelmediyse ekranın tamamı "Tekrar dene" olmalı.
  const [loadError, setLoadError] = useState<unknown>(null);

  const listRef = useRef<FlatList<LocalMessage>>(null);
  const loadTokenRef = useRef(0);
  const hasMessagesRef = useRef(false);
  hasMessagesRef.current = messages.length > 0;
  const sinceRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const canSend = !sending && input.trim().length > 0;

  const scrollToEnd = () => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  };

  const rememberSince = (incoming: ChatMessage[]) => {
    const newest = newestServerTimestamp(incoming);
    if (newest && (!sinceRef.current || newest > sinceRef.current)) {
      sinceRef.current = newest;
    }
  };

  const poll = useCallback(async () => {
    if (inFlightRef.current) return;
    // Uygulama arka plandayken timer'lar Android'de çalışmaya devam ediyor;
    // boşuna istek atmamak için atlıyoruz.
    if (AppState.currentState !== 'active') return;

    inFlightRef.current = true;
    try {
      const { messages: incoming } = await fetchMessages(conversationId, sinceRef.current ?? undefined);
      if (incoming.length > 0) {
        setMessages((prev) => mergeMessages(prev, incoming));
        rememberSince(incoming);
        if (incoming.some((m) => m.senderId !== meId)) {
          markConversationRead(conversationId).catch(() => {});
        }
        if (isNearBottomRef.current) scrollToEnd();
      }
    } catch {
      // Geçici ağ hatası: bir sonraki turda tekrar denenecek.
    } finally {
      inFlightRef.current = false;
    }
  }, [conversationId, meId]);

  const loadInitial = useCallback(() => {
    const token = ++loadTokenRef.current;
    // Mesajlar ekrandayken yeniden odaklanınca iskelete dönülmüyor.
    if (!hasMessagesRef.current) setLoading(true);
    setLoadError(null);
    sinceRef.current = null;

    fetchMessages(conversationId)
      .then(({ messages: initial }) => {
        if (token !== loadTokenRef.current) return;
        setMessages(initial);
        rememberSince(initial);
        markConversationRead(conversationId).catch(() => {});
        scrollToEnd();
      })
      .catch((err: unknown) => {
        if (token === loadTokenRef.current) setLoadError(err);
      })
      .finally(() => {
        if (token === loadTokenRef.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      loadInitial();
      const timer = setInterval(poll, POLL_INTERVAL_MS);
      return () => {
        // Ekrandan çıkınca yarıda kalan ilk yüklemenin sonucu yazılmasın.
        loadTokenRef.current++;
        clearInterval(timer);
      };
    }, [loadInitial, poll])
  );

  const deliver = async (body: string, tempId: string) => {
    try {
      const { message } = await sendMessage(conversationId, body);
      setMessages((prev) => prev.map((m) => (m.id === tempId ? message : m)));
      rememberSince([message]);
      setError(null);
    } catch (err) {
      // Mesaj sık yapılan bir işlem: başarıda titreşim yok, yalnızca hatada.
      haptics.error();
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
      setError(err instanceof Error ? err.message : 'Mesaj gönderilemedi');
    } finally {
      setSending(false);
    }
  };

  const handleSend = async () => {
    const body = input.trim();
    if (!body || sending) return;

    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempId, body, senderId: meId, createdAt: new Date().toISOString(), readAt: null, pending: true },
    ]);
    setInput('');
    setSending(true);
    scrollToEnd();
    await deliver(body, tempId);
  };

  const handleRetry = async (message: LocalMessage) => {
    if (sending) return;
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev.filter((m) => m.id !== message.id),
      { ...message, id: tempId, pending: true, failed: false, createdAt: new Date().toISOString() },
    ]);
    setSending(true);
    await deliver(message.body, tempId);
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    isNearBottomRef.current =
      layoutMeasurement.height + contentOffset.y >= contentSize.height - NEAR_BOTTOM_THRESHOLD_PX;
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <SkeletonList variant="chat" />
      </View>
    );
  }

  if (loadError && messages.length === 0) {
    return (
      <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
        <ErrorState error={loadError} fallback="Mesajlar alınamadı" onRetry={loadInitial} />
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
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onScroll={handleScroll}
          scrollEventThrottle={100}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState compact icon="chatbubbles-outline" title="Henüz mesaj yok" message="İlk mesajı siz yazın." />
          }
          renderItem={({ item, index }) => {
            const isMine = item.senderId === meId;
            const previous = messages[index - 1];
            const startsNewDay =
              !previous || !isSameCalendarDay(new Date(previous.createdAt), new Date(item.createdAt));
            const dayChip = startsNewDay ? (
              <View style={styles.dayChip}>
                <Text style={styles.dayChipText}>{formatDayLabel(item.createdAt)}</Text>
              </View>
            ) : null;

            // Teklif bağlantılı mesaj: balon yerine kart (Faz 2, Adım 2).
            // Dış kap Pressable DEĞİL: içindeki "Teklifi aç" düğmesiyle web'de
            // iç içe <button> oluşmasın (MOBILE-DESIGN web kuralları).
            if (item.quoteRequestId) {
              const quoteRequestId = item.quoteRequestId;
              return (
                <>
                  {dayChip}
                  <View style={[styles.quoteCard, isMine ? styles.quoteCardMine : styles.quoteCardOther]}>
                    <View style={styles.quoteHeader}>
                      <Ionicons name="pricetag-outline" size={15} color={colors.primary} />
                      <Text style={styles.quoteTitle}>Teklif</Text>
                    </View>
                    <Text style={styles.quoteBody}>{item.body}</Text>
                    <Pressable
                      onPress={() => navigation.navigate('QuoteRequestDetail', { requestId: quoteRequestId })}
                      accessibilityRole="button"
                      accessibilityLabel="Teklifi aç"
                      style={({ pressed }) => [styles.quoteAction, pressed && styles.pressedFade]}
                    >
                      <Text style={styles.quoteActionText}>Teklifi aç</Text>
                      <Ionicons name="chevron-forward" size={15} color={colors.primary} />
                    </Pressable>
                    <Text style={[styles.time, styles.otherMeta]}>{formatClockTime(item.createdAt)}</Text>
                  </View>
                </>
              );
            }

            return (
              <>
                {dayChip}
                <Pressable
                  disabled={!item.failed}
                  onPress={() => handleRetry(item)}
                  accessibilityRole={item.failed ? 'button' : undefined}
                  accessibilityLabel={
                    item.failed ? `Gönderilemedi: ${item.body}. Tekrar denemek için dokunun.` : undefined
                  }
                  style={({ pressed }) => [
                    styles.bubble,
                    isMine ? styles.myBubble : styles.otherBubble,
                    item.failed && styles.failedBubble,
                    pressed && item.failed && styles.pressedFade,
                  ]}
                >
                  <Text style={isMine ? styles.myText : styles.otherText}>{item.body}</Text>
                  {item.failed ? (
                    <View style={styles.failedRow}>
                      <Ionicons name="alert-circle" size={13} color={isMine ? colors.primaryText : colors.danger} />
                      <Text style={[styles.failedText, isMine ? styles.myMeta : styles.dangerText]}>
                        Gönderilemedi. Tekrar denemek için dokunun.
                      </Text>
                    </View>
                  ) : (
                    <Text style={[styles.time, isMine ? styles.myMeta : styles.otherMeta]}>
                      {item.pending ? 'Gönderiliyor' : formatClockTime(item.createdAt)}
                    </Text>
                  )}
                </Pressable>
              </>
            );
          }}
        />
        {error ? <InlineError message={error} style={styles.banner} /> : null}
        <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
          <TextInput
            style={styles.input}
            placeholder="Mesaj yazın"
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            accessibilityLabel="Mesaj"
          />
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Mesajı gönder"
            accessibilityState={{ disabled: !canSend }}
            style={({ pressed }) => [styles.sendButton, !canSend && styles.sendDisabled, pressed && canSend && styles.pressedFade]}
          >
            <Ionicons name="send" size={18} color={colors.primaryText} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  listContent: { paddingHorizontal: spacing.gutter, paddingTop: spacing.gutter, paddingBottom: spacing.sm },
  banner: { marginHorizontal: spacing.gutter, marginBottom: spacing.sm },
  dayChip: {
    alignSelf: 'center',
    backgroundColor: colors.chip,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: spacing.sm,
  },
  dayChipText: { ...typography.caption, fontFamily: fonts.semibold, color: colors.textMuted },
  // Gönderenin tarafındaki alt köşe sivri: konuşmanın yönü okunsun.
  bubble: {
    maxWidth: '78%',
    borderRadius: radius.lg,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: spacing.sm,
    gap: 4,
  },
  myBubble: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 2 },
  otherBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 2,
  },
  failedBubble: { opacity: 0.75 },
  // Teklif kartı: balonlarla aynı hizada ama beyaz blok, başlıklı.
  quoteCard: {
    maxWidth: '78%',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: spacing.sm,
    gap: 4,
  },
  quoteCardMine: { alignSelf: 'flex-end', borderBottomRightRadius: 2 },
  quoteCardOther: { alignSelf: 'flex-start', borderBottomLeftRadius: 2 },
  quoteHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  quoteTitle: { ...typography.label, fontFamily: fonts.semibold, color: colors.primary },
  quoteBody: { ...typography.body, color: colors.text },
  quoteAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: MIN_TOUCH,
  },
  quoteActionText: { ...typography.label, fontFamily: fonts.semibold, color: colors.primary },
  pressedFade: { opacity: 0.6 },
  myText: { ...typography.body, color: colors.primaryText },
  otherText: { ...typography.body, color: colors.text },
  time: { ...typography.mono, fontSize: 12, lineHeight: 16, alignSelf: 'flex-end' },
  myMeta: { color: colors.onPrimaryMuted },
  otherMeta: { color: colors.textMuted },
  dangerText: { color: colors.danger },
  failedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  failedText: { ...typography.caption, fontSize: 12, lineHeight: 16 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.gutter,
    paddingTop: 10,
  },
  input: {
    flex: 1,
    minHeight: MIN_TOUCH,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTonal,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
  sendButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
});
