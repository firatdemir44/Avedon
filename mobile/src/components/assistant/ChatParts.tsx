import React from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatClockTime, formatDayLabel } from '../../features/time';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';

// Asistan sohbetlerinin ortak parçaları: gün ayracı, balonlar, yazma çubuğu.
// İki ekran kullanır: kendi firma asistanı (AssistantScreen) ve başka firmanın
// satıcı asistanı (SellerAssistantScreen, Faz 2 Adım 3). Kopyalanmasın diye
// burada; asistan kızılı yalnızca gönder düğmesinde (renk kuralı).

export function ChatDayChip({ createdAt }: { createdAt: string }) {
  return (
    <View style={styles.dayChip}>
      <Text style={styles.dayChipText}>{formatDayLabel(createdAt)}</Text>
    </View>
  );
}

// Kullanıcı balonu: lacivert dolu, sağda; saat mono. `local` henüz sunucuya
// yazılmamış mesaj (gönderilirken hemen görünsün diye).
export function UserBubble({ text, createdAt, local }: { text: string; createdAt: string; local?: boolean }) {
  return (
    <View style={styles.userBubble}>
      <Text style={styles.userText}>{text}</Text>
      <Text style={styles.userTime}>{local ? 'Gönderiliyor' : formatClockTime(createdAt)}</Text>
    </View>
  );
}

export function AssistantBubble({ text }: { text: string }) {
  return (
    <View style={styles.assistantBubble}>
      <Text style={styles.assistantText}>{text}</Text>
    </View>
  );
}

// "Hesaplıyor..." göstergesi (yanıt beklenirken); avatarı çağıran ekran koyar.
export function ThinkingBubble({ label = 'Hesaplıyor...' }: { label?: string }) {
  return (
    <View style={styles.typingBubble} accessibilityLiveRegion="polite">
      <ActivityIndicator size="small" color={colors.assistant} />
      <Text style={styles.typingText}>{label}</Text>
    </View>
  );
}

export interface ComposerChip {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel?: string;
}

// Tonlu çok satırlı kutu + 44px kare kızıl gönder düğmesi. `chips` verilirse
// kutunun üstünde yatay kaydırılan çipler çizilir (satıcı asistanında yok).
export function AssistantComposer({
  inputRef,
  value,
  onChangeText,
  onSend,
  canSend,
  placeholder = 'Sor, hesaplat, etiket yapıştır...',
  accessibilityLabel = 'Asistana sorunuz',
  bottomInset,
  chips,
}: {
  inputRef?: React.Ref<TextInput>;
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  canSend: boolean;
  placeholder?: string;
  accessibilityLabel?: string;
  bottomInset: number;
  chips?: ComposerChip[];
}) {
  return (
    <View style={[styles.footer, { paddingBottom: bottomInset + 10 }]}>
      {chips?.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.chipRow}
        >
          {chips.map((chip) => (
            <Pressable
              key={chip.label}
              onPress={chip.onPress}
              accessibilityRole="button"
              accessibilityLabel={chip.accessibilityLabel ?? chip.label}
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            >
              {chip.icon ? <Ionicons name={chip.icon} size={14} color={colors.primary} /> : null}
              <Text style={styles.chipText}>{chip.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.composer}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          value={value}
          onChangeText={onChangeText}
          multiline
          accessibilityLabel={accessibilityLabel}
        />
        <Pressable
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Gönder"
          accessibilityState={{ disabled: !canSend }}
          style={({ pressed }) => [styles.send, !canSend && styles.sendDisabled, pressed && canSend && styles.sendPressed]}
        >
          <Ionicons name="arrow-up" size={20} color={colors.primaryText} />
        </Pressable>
      </View>
    </View>
  );
}

// Sohbet ekranlarının ortak düzen stilleri (liste, satır, örnek soru kutusu).
export const chatStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  listContent: { paddingHorizontal: spacing.gutter, paddingTop: 12, paddingBottom: spacing.md, gap: 12 },
  assistantRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  assistantColumn: { flex: 1, minWidth: 0, gap: spacing.sm },
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
  examplePressed: { backgroundColor: colors.pressed },
});

const styles = StyleSheet.create({
  dayChip: {
    alignSelf: 'center',
    backgroundColor: colors.chip,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
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
  userTime: {
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 15,
    color: colors.onPrimaryMuted,
    textAlign: 'right',
    marginTop: 4,
  },

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
  // Asistan kızılı: gönder düğmesi (renk kuralı, MOBILE-DESIGN.md Asistan).
  send: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radius.md,
    backgroundColor: colors.assistant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.45 },
  sendPressed: { opacity: 0.85 },
});
