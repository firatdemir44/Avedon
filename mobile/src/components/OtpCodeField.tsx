// SMS doğrulama kodu alanı (yeni tasarım, 4. adım).
// `ui/Input` (48px alan, odak çerçevesi) + altında "sessiz" düğme ile tekrar
// gönderme. Sayaç dolana kadar düğme pasif. Ham hex / ham px yok.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Button, Input } from '../ui';
import { tr } from '../i18n';

interface Props {
  code: string;
  onChangeCode: (code: string) => void;
  onResend: () => void;
  resendCooldownSeconds: number;
  resending?: boolean;
}

export function OtpCodeField({ code, onChangeCode, onResend, resendCooldownSeconds, resending }: Props) {
  const t = useTheme();
  const [remaining, setRemaining] = useState(resendCooldownSeconds);

  useEffect(() => {
    setRemaining(resendCooldownSeconds);
  }, [resendCooldownSeconds]);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setInterval(() => setRemaining((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(timer);
  }, [remaining > 0]);

  const waiting = remaining > 0 || !!resending;

  return (
    <View style={{ gap: t.space[2], minWidth: 0 }}>
      <Input
        label={tr('Doğrulama kodu')}
        value={code}
        onChangeText={onChangeCode}
        placeholder="123456"
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={6}
        // Telefonun SMS kodunu otomatik doldurması.
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
      />
      {/* Ekrandaki tek dolu düğme ana eylem; bu sessiz. */}
      <Button
        kind="quiet"
        disabled={waiting}
        onPress={onResend}
        label={
          remaining > 0
            ? tr('Kodu tekrar gönder ({n} sn)', { n: remaining })
            : resending
              ? tr('Gönderiliyor…')
              : tr('Kodu tekrar gönder')
        }
      />
    </View>
  );
}
