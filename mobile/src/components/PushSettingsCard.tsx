import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from './PrimaryButton';
import { ApiError, fetchPushPublicKey, sendTestPush } from '../api/client';
import {
  currentPushState,
  disablePush,
  enablePush,
  type PushPermission,
  type PushSupport,
} from '../features/push/webPush';
import { confirmAction } from '../features/confirm';
import { haptics } from '../features/haptics';
import { colors, radius, spacing, typography } from '../theme';

// Anlık bildirim ayarı — Bildirimler ekranının en üstünde ince bir kart.
// YALNIZCA WEB'de ve yalnızca sunucuda Web Push açıkken görünür; native'de ve
// desteklemeyen tarayıcılarda hiç çizilmez. Profil menüsüne ayrıca satır
// eklenmedi (karışıklık olmasın).
//
// İç içe düğme yok: kartın kendisi dokunulamaz, düğmeler yan yana duruyor.

export function PushSettingsCard() {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [permission, setPermission] = useState<PushPermission>('unavailable');
  const [subscribed, setSubscribed] = useState(false);
  // Sunucu VAPID anahtarı tanımlı değilse kart hiç görünmez.
  const [serverEnabled, setServerEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const state = await currentPushState();
    setSupport(state.support);
    setPermission(state.permission);
    setSubscribed(state.subscribed);
    return state;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const state = await currentPushState();
      if (!alive) return;
      setSupport(state.support);
      setPermission(state.permission);
      setSubscribed(state.subscribed);
      if (state.support === 'unsupported') {
        setServerEnabled(false);
        return;
      }
      try {
        const key = await fetchPushPublicKey();
        if (alive) setServerEnabled(key.enabled && !!key.publicKey);
      } catch {
        if (alive) setServerEnabled(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const turnOn = useCallback(async () => {
    setBusy(true);
    setNote(null);
    const result = await enablePush();
    await refresh();
    setBusy(false);
    if (result === 'enabled') {
      haptics.success();
      setNote({ tone: 'ok', text: 'Anlık bildirimler açıldı.' });
      return;
    }
    haptics.error();
    if (result === 'denied') {
      setNote({ tone: 'error', text: 'Bildirim izni verilmedi.' });
      return;
    }
    if (result === 'not-configured') {
      setServerEnabled(false);
      return;
    }
    setNote({
      tone: 'error',
      text:
        result === 'unsupported'
          ? 'Bu tarayıcı anlık bildirimi desteklemiyor.'
          : 'Bildirimler açılamadı, tekrar deneyin.',
    });
  }, [refresh]);

  const turnOff = useCallback(async () => {
    const ok = await confirmAction({
      title: 'Anlık bildirimler kapatılsın mı?',
      message: 'Yeni mesaj ve teklifler için bildirim almayı durdurursunuz.',
      confirmLabel: 'Kapat',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setNote(null);
    await disablePush();
    await refresh();
    setBusy(false);
    setNote({ tone: 'ok', text: 'Anlık bildirimler kapatıldı.' });
  }, [refresh]);

  const sendTest = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      await sendTestPush();
      setNote({ tone: 'ok', text: 'Deneme bildirimi gönderildi.' });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setNote({
        tone: 'error',
        text:
          code === 'no_subscription'
            ? 'Bu cihaz kayıtlı değil. Bildirimleri kapatıp yeniden açın.'
            : code === 'push_not_configured'
              ? 'Sunucuda anlık bildirim kapalı.'
              : 'Deneme bildirimi gönderilemedi.',
      });
    }
    setBusy(false);
  }, []);

  // Durum bilinmiyorken ya da desteklenmiyorken kart hiç çizilmez.
  if (support === null || serverEnabled === null) return null;
  if (support === 'unsupported' || !serverEnabled) return null;

  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <Ionicons
          name={subscribed ? 'notifications' : 'notifications-outline'}
          size={22}
          color={colors.primary}
          style={styles.icon}
        />
        <View style={styles.body}>
          {support === 'needs-install' ? (
            <>
              <Text style={styles.title}>Anlık bildirim için ana ekrana ekleyin</Text>
              <Text style={styles.note}>
                iPhone'da bildirim için: Paylaş düğmesi → Ana Ekrana Ekle, sonra Avedon'u ana ekrandan açın.
              </Text>
            </>
          ) : permission === 'denied' ? (
            <>
              <Text style={styles.title}>Bildirim izni kapalı</Text>
              <Text style={styles.note}>
                Bildirim izni tarayıcıda kapalı. Tarayıcı ayarlarından bu site için bildirimlere izin verin.
              </Text>
            </>
          ) : subscribed ? (
            <>
              <Text style={styles.title}>Anlık bildirimler açık</Text>
              <View style={styles.links}>
                <Pressable
                  onPress={sendTest}
                  disabled={busy}
                  accessibilityRole="button"
                  hitSlop={10}
                  style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
                >
                  <Text style={styles.linkText}>Deneme bildirimi gönder</Text>
                </Pressable>
                <Pressable
                  onPress={turnOff}
                  disabled={busy}
                  accessibilityRole="button"
                  hitSlop={10}
                  style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
                >
                  <Text style={[styles.linkText, styles.linkDanger]}>Kapat</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.note}>
                Yeni mesaj, teklif ve numune taleplerinde telefonunuza bildirim gelir.
              </Text>
              <PrimaryButton
                label={busy ? 'Açılıyor...' : 'Anlık bildirimleri aç'}
                size="sm"
                onPress={() => void turnOn()}
                disabled={busy}
                style={styles.button}
              />
            </>
          )}
          {note ? (
            <Text style={[styles.status, note.tone === 'error' && styles.statusError]}>{note.text}</Text>
          ) : null}
        </View>
        {busy ? <ActivityIndicator color={colors.primary} style={styles.spinner} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.surface, marginBottom: spacing.blockGap },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  icon: { marginTop: 2 },
  // 375px'te taşma olmasın: metin sütunu daralabilmeli.
  body: { flex: 1, minWidth: 0, gap: spacing.xs },
  title: { ...typography.label, color: colors.text },
  note: { ...typography.caption, color: colors.textMuted },
  button: { alignSelf: 'flex-start', marginTop: spacing.xs },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  link: { paddingVertical: spacing.xs },
  linkPressed: { opacity: 0.6 },
  linkText: { ...typography.caption, color: colors.accent },
  linkDanger: { color: colors.danger },
  status: { ...typography.caption, color: colors.success, marginTop: spacing.xs },
  statusError: { color: colors.danger },
  spinner: { marginTop: 2 },
});
