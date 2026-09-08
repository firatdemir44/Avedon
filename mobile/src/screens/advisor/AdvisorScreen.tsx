import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { askAdvisor, type AdvisorMessage } from '../../api/client';
import { colors, radius, spacing } from '../../theme';

interface ChatItem extends AdvisorMessage {
  id: string;
}

const SUGGESTIONS = [
  'Raschel ile interlok arasındaki fark ne?',
  'Pamuklu kumaşta çekme payı nasıl hesaplanır?',
  'Ring iplik ile open-end iplik farkı nedir?',
];

export function AdvisorScreen() {
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Merhaba! Ben Avedon AI Tekstil Danışmanı. Örme, dokuma, boyama, terbiye, iplik numaralandırma gibi konularda sorularınızı yanıtlayabilirim. Ne öğrenmek istersiniz?',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const listRef = useRef<FlatList>(null);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || loading) return;

    const userItem: ChatItem = { id: `${Date.now()}-u`, role: 'user', content: question };
    const history: AdvisorMessage[] = messages
      .filter((m) => m.id !== 'welcome')
      .map(({ role, content }) => ({ role, content }));

    setMessages((prev) => [...prev, userItem]);
    setInput('');
    setLoading(true);

    try {
      const { answer } = await askAdvisor(question, history);
      setMessages((prev) => [...prev, { id: `${Date.now()}-a`, role: 'assistant', content: answer }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'advisor_not_configured') {
        setNotConfigured(true);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-err`,
            role: 'assistant',
            content: 'Şu anda yanıt veremiyorum, lütfen daha sonra tekrar deneyin.',
          },
        ]);
      }
    } finally {
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        {notConfigured ? (
          <View style={styles.centered}>
            <Text style={styles.notConfiguredText}>
              AI Tekstil Danışmanı henüz etkinleştirilmedi. Backend'de ANTHROPIC_API_KEY tanımlanmalı.
            </Text>
          </View>
        ) : (
          <>
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
              renderItem={({ item }) => (
                <View style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
                  <Text style={item.role === 'user' ? styles.userText : styles.assistantText}>{item.content}</Text>
                </View>
              )}
              ListFooterComponent={
                loading ? <ActivityIndicator style={{ marginTop: spacing.sm }} color={colors.primary} /> : null
              }
            />
            {messages.length <= 1 ? (
              <View style={styles.suggestions}>
                {SUGGESTIONS.map((s) => (
                  <Pressable key={s} style={styles.suggestionChip} onPress={() => send(s)}>
                    <Text style={styles.suggestionText}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Bir soru sorun..."
                placeholderTextColor={colors.textMuted}
                value={input}
                onChangeText={setInput}
                onSubmitEditing={() => send(input)}
                editable={!loading}
              />
              <Pressable style={styles.sendButton} onPress={() => send(input)} disabled={loading || !input.trim()}>
                <Text style={styles.sendButtonText}>Gönder</Text>
              </Pressable>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  notConfiguredText: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 14,
  },
  listContent: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  bubble: {
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    maxWidth: '85%',
  },
  userBubble: {
    backgroundColor: colors.primary,
    alignSelf: 'flex-end',
  },
  assistantBubble: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  userText: {
    color: colors.primaryText,
    fontSize: 15,
    lineHeight: 21,
  },
  assistantText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  suggestions: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  suggestionChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.xs,
  },
  suggestionText: {
    fontSize: 13,
    color: colors.text,
  },
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
  sendButtonText: {
    color: colors.primaryText,
    fontWeight: '600',
    fontSize: 14,
  },
});
