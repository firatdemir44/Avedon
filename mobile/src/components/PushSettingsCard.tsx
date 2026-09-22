// Anlık bildirim ayarı — Bildirimler ekranının en üstünde bir kart.
// YALNIZCA WEB'de ve yalnızca sunucuda Web Push açıkken görünür; native'de ve
// desteklemeyen tarayıcılarda hiç çizilmez. Profil menüsüne ayrıca satır
// eklenmedi (karışıklık olmasın).
//
// İç içe düğme yok: kartın kendisi dokunulamaz, düğmeler altında duruyor.
// Yeni tasarım (4. adım): `ui/Card` + token'lar; ham hex / ham px yok.
// Dışa aktarılan ad ve API (propsuz `PushSettingsCard`) DEĞİŞMEDİ.
import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { ApiError, fetchPushPublicKey, sendTestPush } from '../api/client';
import {
  currentPushState,
  getLastPushError,
  disablePush,
  enablePush,
  type PushPermission,
  type PushSupport,
} from '../features/push/webPush';
import { confirmAction } from '../features/confirm';
import { haptics } from '../features/haptics';
import { useTheme } from '../theme/ThemeContext';
import { Button, Card, Icon } from '../ui';

export function PushSettingsCard() {
  const t = useTheme();
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
          : `Bildirimler açılamadı, tekrar deneyin.${getLastPushError() ? ` (Hata kodu: ${getLastPushError()})` : ''}`,
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

  // Duruma göre başlık / açıklama / eylem. Ekranda dolu (primary) düğme yok:
  // hepsi kenarlıklı (secondary) ya da tehlikeli (danger).
  const title =
    support === 'needs-install'
      ? 'Anlık bildirim için ana ekrana ekleyin'
      : permission === 'denied'
        ? 'Bildirim izni kapalı'
        : subscribed
          ? 'Anlık bildirimler açık'
          : 'Anlık bildirimleri aç';

  const description =
    support === 'needs-install'
      ? "iPhone'da bildirim için: Paylaş düğmesi → Ana Ekrana Ekle, sonra Avedon'u ana ekrandan açın."
      : permission === 'denied'
        ? 'Bildirim izni tarayıcıda kapalı. Tarayıcı ayarlarından bu site için bildirimlere izin verin.'
        : subscribed
          ? 'Yeni mesaj, teklif ve numune talepleri telefonunuza bildirim olarak gelir.'
          : 'Yeni mesaj, teklif ve numune taleplerinde telefonunuza bildirim gelir.';

  const showActions = support !== 'needs-install' && permission !== 'denied';

  return (
    <Card>
      <View style={{ gap: t.space[3], minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.space[3], minWidth: 0 }}>
          <Icon name={subscribed ? 'notifications' : 'bell'} color="brand" />
          {/* 375px'te taşma olmasın: metin sütunu daralabilmeli. */}
          <View style={{ flex: 1, minWidth: 0, gap: t.space[1] }}>
            <Text style={[t.type.title18, { color: t.colors.ink }]}>{title}</Text>
            <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{description}</Text>
          </View>
        </View>

        {showActions ? (
          subscribed ? (
            // Açıkken iki eylem var (deneme + kapatma); dolu düğme yok.
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
              <Button
                kind="secondary"
                icon="bell"
                label="Deneme bildirimi gönder"
                disabled={busy}
                loading={busy}
                onPress={() => void sendTest()}
              />
              <Button kind="danger" icon="x" label="Kapat" disabled={busy} onPress={() => void turnOff()} />
            </View>
          ) : (
            <Button
              kind="secondary"
              icon="bell"
              label="Anlık bildirimleri aç"
              disabled={busy}
              loading={busy}
              onPress={() => void turnOn()}
            />
          )
        ) : null}

        {note ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], minWidth: 0 }}>
            <Icon
              name={note.tone === 'error' ? 'warning' : 'check'}
              size={t.size.iconSm}
              color={note.tone === 'error' ? 'danger' : 'success'}
            />
            <Text
              style={[
                t.type.body14,
                { color: note.tone === 'error' ? t.colors.danger : t.colors.success, flex: 1, minWidth: 0 },
              ]}
            >
              {note.text}
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}
