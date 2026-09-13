import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { TextField } from './TextField';
import { colors, spacing } from '../theme';

interface Props {
  code: string;
  onChangeCode: (code: string) => void;
  onResend: () => void;
  resendCooldownSeconds: number;
  resending?: boolean;
}

export function OtpCodeField({ code, onChangeCode, onResend, resendCooldownSeconds, resending }: Props) {
  const [remaining, setRemaining] = useState(resendCooldownSeconds);

  useEffect(() => {
    setRemaining(resendCooldownSeconds);
  }, [resendCooldownSeconds]);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setInterval(() => setRemaining((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(timer);
  }, [remaining > 0]);

  return (
    <View>
      <TextField
        label="Doğrulama Kodu"
        value={code}
        onChangeText={onChangeCode}
        placeholder="123456"
        keyboardType="number-pad"
        maxLength={6}
      />
      <Pressable disabled={remaining > 0 || resending} onPress={onResend} style={styles.resendRow}>
        <Text style={[styles.resendText, (remaining > 0 || resending) && styles.resendTextDisabled]}>
          {remaining > 0 ? `Kodu tekrar gönder (${remaining}sn)` : resending ? 'Gönderiliyor...' : 'Kodu tekrar gönder'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  resendRow: {
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  resendText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  resendTextDisabled: {
    color: colors.textMuted,
  },
});
