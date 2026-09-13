import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  AppState,
  Platform,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { formatClockTime } from '../../features/messages/time';
import { colors, radius, spacing } from '../../theme';

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

export function ChatScreen({ route }: Props) {
  const { conversationId } = route.params;
  const { user } = useSession();
  const meId = user?.id ?? '';

  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<FlatList<LocalMessage>>(null);
  const sinceRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const isNearBottomRef = useRef(true);

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

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      sinceRef.current = null;

      fetchMessages(conversationId)
        .then(({ messages: initial }) => {
          if (cancelled) return;
          setMessages(initial);
          rememberSince(initial);
          markConversationRead(conversationId).catch(() => {});
          scrollToEnd();
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Mesajlar alınamadı');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      const timer = setInterval(poll, POLL_INTERVAL_MS);
      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }, [conversationId, poll])
  );

  const deliver = async (body: string, tempId: string) => {
    try {
      const { message } = await sendMessage(conversationId, body);
      setMessages((prev) => prev.map((m) => (m.id === tempId ? message : m)));
      rememberSince([message]);
      setError(null);
    } catch (err) {
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
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
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
          ListEmptyComponent={<Text style={styles.empty}>Henüz mesaj yok. İlk mesajı siz yazın.</Text>}
          renderItem={({ item }) => {
            const isMine = item.senderId === meId;
            return (
              <Pressable
                disabled={!item.failed}
                onPress={() => handleRetry(item)}
                style={[styles.bubble, isMine ? styles.myBubble : styles.otherBubble]}
              >
                <Text style={isMine ? styles.myText : styles.otherText}>{item.body}</Text>
                <Text style={[styles.timeText, isMine ? styles.myTimeText : styles.otherTimeText]}>
                  {item.failed
                    ? 'Gönderilemedi — tekrar denemek için dokunun'
                    : item.pending
                      ? 'Gönderiliyor...'
                      : formatClockTime(item.createdAt)}
                </Text>
              </Pressable>
            );
          }}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Mesaj yazın..."
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
          />
          <Pressable style={styles.sendButton} onPress={handleSend} disabled={sending || !input.trim()}>
            <Text style={styles.sendButtonText}>Gönder</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.lg },
  bubble: {
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    maxWidth: '85%',
  },
  myBubble: {
    backgroundColor: colors.primary,
    alignSelf: 'flex-end',
  },
  otherBubble: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  myText: { color: colors.primaryText, fontSize: 15, lineHeight: 21 },
  otherText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  timeText: { fontSize: 11, marginTop: 4 },
  myTimeText: { color: colors.primaryText, opacity: 0.8, textAlign: 'right' },
  otherTimeText: { color: colors.textMuted },
  inputRow: {
    flexDirection: 'row',
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    fontSize: 15,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  sendButton: {
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  sendButtonText: { color: colors.primaryText, fontWeight: '600', fontSize: 14 },
  error: {
    fontSize: 13,
    color: colors.danger,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
});
