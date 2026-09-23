// Asistan sohbetlerinin ortak parçaları: gün ayracı, balonlar, yazma çubuğu.
// İki ekran kullanır: kendi firma asistanı (AssistantScreen) ve başka firmanın
// satıcı asistanı (SellerAssistantScreen, Faz 2 Adım 3).
//
// Yeni tasarım (DESIGN.md, 4. adım): asistan balonu SOLDA `surface1` + 1px
// `line`; kullanıcı balonu SAĞDA `brand` zemin + `onBrand` metin. Bakır
// (`accent`) burada KULLANILMAZ — o yalnızca asistan avatarı ve rozeti içindir;
// gönder düğmesi marka rengindedir.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, type ViewStyle } from 'react-native';
import { formatClockTime, formatDayLabel } from '../../features/time';
import { useTheme } from '../../theme/ThemeContext';
import { Chip, ChipRow, Icon, type AnyIconName } from '../../ui';
import { fetchSpeechAvailable, transcribeAudio } from '../../api/client';
import { canListen, canRecord, startRecording, canSpeak, markVoiceTurn, onSpeakingChange, startListening, stopSpeaking, toggleSpeak, unlockSpeech, type ListenError } from '../../features/speech';

export function ChatDayChip({ createdAt }: { createdAt: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        alignSelf: 'center',
        backgroundColor: t.colors.surface2,
        borderRadius: t.radius.full,
        paddingHorizontal: t.space[3],
        paddingVertical: t.space[1],
      }}
    >
      <Text style={[t.type.caption12, { color: t.colors.ink2 }]}>{formatDayLabel(createdAt)}</Text>
    </View>
  );
}

// Kullanıcı balonu: marka zeminli, sağda. `local` henüz sunucuya yazılmamış
// mesaj (gönderilirken hemen görünsün diye).
export function UserBubble({ text, createdAt, local }: { text: string; createdAt: string; local?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={{
        alignSelf: 'flex-end',
        maxWidth: '80%',
        minWidth: 0,
        backgroundColor: t.colors.brand,
        borderRadius: t.radius.lg,
        padding: t.space[3],
        gap: t.space[1],
      }}
    >
      <Text style={[t.type.body16, { color: t.colors.onBrand }]}>{text}</Text>
      <Text style={[t.type.caption12, { color: t.colors.onBrand, textAlign: 'right' }]}>
        {local ? 'Gönderiliyor' : formatClockTime(createdAt)}
      </Text>
    </View>
  );
}

export function AssistantBubble({ text, createdAt }: { text: string; createdAt?: string }) {
  const t = useTheme();
  const id = useRef(`b-${Math.random().toString(36).slice(2)}`).current;
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => onSpeakingChange((cur) => setSpeaking(cur === id)), [id]);
  // Balon ekrandan kalkınca okuma sürüyorsa durur.
  useEffect(() => () => { if (speaking) stopSpeaking(); }, [speaking]);
  return (
    <View style={assistantBubbleStyle(t)}>
      <Text style={[t.type.body16, { color: t.colors.ink }]}>{text}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space[2] }}>
        {createdAt ? <Text style={[t.type.caption12, { color: t.colors.ink3 }]}>{formatClockTime(createdAt)}</Text> : <View />}
        {canSpeak() ? (
          <Pressable
            onPress={() => toggleSpeak(id, text)}
            accessibilityRole="button"
            accessibilityLabel={speaking ? 'Okumayı durdur' : 'Sesli oku'}
            hitSlop={t.space[2]}
            style={({ pressed }) => ({
              minWidth: t.size.touchMin,
              minHeight: t.size.touchMin / 1.5,
              alignItems: 'flex-end',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Icon name={speaking ? 'stop-circle-outline' : 'volume-high-outline'} size={t.size.iconSm} colorValue={t.colors.brand} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// "Hesaplıyor..." göstergesi (yanıt beklenirken); avatarı çağıran ekran koyar.
export function ThinkingBubble({ label = 'Hesaplıyor...' }: { label?: string }) {
  const t = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[assistantBubbleStyle(t), { flexDirection: 'row', alignItems: 'center', gap: t.space[2] }]}
    >
      <ActivityIndicator size="small" color={t.colors.brand} />
      <Text style={[t.type.body14, { color: t.colors.ink2, flex: 1, minWidth: 0 }]}>{label}</Text>
    </View>
  );
}

function assistantBubbleStyle(t: ReturnType<typeof useTheme>): ViewStyle {
  return {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minWidth: 0,
    backgroundColor: t.colors.surface1,
    borderWidth: 1,
    borderColor: t.colors.line,
    borderRadius: t.radius.lg,
    padding: t.space[3],
    gap: t.space[1],
  };
}

export interface ComposerChip {
  label: string;
  icon?: AnyIconName;
  onPress: () => void;
  accessibilityLabel?: string;
}

// Ekranın altında yapışkan giriş alanı: 48px kutu + ≥44px gönder düğmesi.
// `chips` verilirse kutunun üstünde yatay kaydırılan öneri çipleri çizilir
// (satıcı asistanında yok).
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
  const t = useTheme();
  const [micError, setMicError] = useState<string | null>(null);
  const [micStatus, setMicStatus] = useState<MicStatus | null>(null);
  return (
    <View
      style={[
        {
          backgroundColor: t.colors.surface1,
          borderTopWidth: 1,
          borderTopColor: t.colors.line,
          paddingTop: t.space[2],
          paddingBottom: bottomInset + t.space[3],
          paddingHorizontal: t.space[4],
          gap: t.space[2],
        },
        t.shadowRaised,
      ]}
    >
      {micStatus ? <MicStatusBar status={micStatus} /> : null}
      {chips?.length && !micStatus ? (
        <ChipRow>
          {chips.map((chip) => (
            <Chip
              key={chip.label}
              label={chip.label}
              icon={chip.icon}
              onPress={chip.onPress}
            />
          ))}
        </ChipRow>
      ) : null}
      <View
        style={{
          width: '100%',
          maxWidth: t.size.maxContentWidth,
          alignSelf: 'center',
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: t.space[2],
          minWidth: 0,
        }}
      >
        <TextInput
          ref={inputRef}
          placeholder={placeholder}
          placeholderTextColor={t.colors.ink3}
          value={value}
          onChangeText={onChangeText}
          multiline
          accessibilityLabel={accessibilityLabel}
          style={[
            t.type.body16,
            {
              flex: 1,
              minWidth: 0,
              minHeight: t.size.control,
              // Uzun metinde kutu büyür ama sohbeti yemesin.
              maxHeight: t.size.controlLg * 2,
              borderRadius: t.radius.md,
              borderWidth: 1,
              borderColor: t.colors.lineStrong,
              backgroundColor: t.colors.surface1,
              color: t.colors.ink,
              paddingHorizontal: t.space[3],
              paddingVertical: t.space[3],
              outlineStyle: 'none',
            } as never,
          ]}
        />
        {(canListen() || canRecord()) && !value.trim() ? (
          <MicButton onText={onChangeText} onError={setMicError} onStatus={setMicStatus} />
        ) : (
          <SendButton onPress={onSend} canSend={canSend} />
        )}
      </View>
      {micError ? (
        <Text style={[t.type.body14, { color: t.colors.danger, textAlign: 'center' }]}>{micError}</Text>
      ) : null}
    </View>
  );
}

const MIC_ERRORS: Record<ListenError, string> = {
  'not-allowed': 'Mikrofon izni kapalı. Tarayıcı ayarlarından bu siteye mikrofon izni verin.',
  'no-speech': 'Ses duyulmadı, tekrar deneyin.',
  network: 'Ses tanıma için internet bağlantısı gerekiyor.',
  other: 'Ses tanınamadı, tekrar deneyin.',
};

// Mikrofon: dokun, konuş; konuşma bitince metin kutuya yazılır, gönder düğmesi çıkar.
// Metin göndermeden önce görülür ve düzeltilebilir.
// Sunucu ses tanıma durumu uygulama boyunca bir kez sorulur.
let serverSpeech: boolean | null = null;

// Kayıt sırasında kullanıcı "beni duyuyor mu?" diye şüphelenmesin: süre, ses seviyesi ve
// ne yapacağı yazılır; durdurunca "Yazıya çevriliyor…" (Fırat 2026-09-23 geri bildirimi).
type MicStatus = { phase: 'recording'; seconds: number; level: number } | { phase: 'transcribing' };

function MicStatusBar({ status }: { status: MicStatus }) {
  const t = useTheme();
  const bars = [0.35, 0.6, 1, 0.6, 0.35];
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2], alignSelf: 'center', width: '100%', maxWidth: t.size.maxContentWidth, minHeight: t.size.touchMin }}
    >
      {status.phase === 'recording' ? (
        <>
          <View style={{ width: t.size.dot, height: t.size.dot, borderRadius: t.radius.full, backgroundColor: t.colors.danger }} />
          <Text style={[t.type.label14, { color: t.colors.ink }]}>
            Dinliyorum · {Math.floor(status.seconds / 60)}:{String(status.seconds % 60).padStart(2, '0')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[1], height: t.size.iconSm }}>
            {bars.map((w, i) => (
              <View
                key={i}
                style={{
                  width: t.space[1],
                  height: Math.max(t.space[1], t.size.iconSm * Math.min(1, status.level * w * 1.6)),
                  borderRadius: t.radius.full,
                  backgroundColor: status.level > 0.04 ? t.colors.brand : t.colors.line,
                }}
              />
            ))}
          </View>
          <Text style={[t.type.body14, { color: t.colors.ink2, flex: 1, minWidth: 0 }]} numberOfLines={2}>
            Bitince kırmızı düğmeye dokunun; yazı sonra gelir.
          </Text>
        </>
      ) : (
        <>
          <ActivityIndicator color={t.colors.brand} />
          <Text style={[t.type.label14, { color: t.colors.ink }]}>Yazıya çevriliyor…</Text>
        </>
      )}
    </View>
  );
}

function MicButton({ onText, onError, onStatus }: { onText: (t: string) => void; onError: (m: string | null) => void; onStatus?: (s: MicStatus | null) => void }) {
  const t = useTheme();
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [server, setServer] = useState<boolean | null>(serverSpeech);
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRef.current?.(), []);
  useEffect(() => {
    if (serverSpeech !== null || !canRecord()) return;
    fetchSpeechAvailable()
      .then((r) => setServer((serverSpeech = r.available)))
      .catch(() => setServer((serverSpeech = false)));
  }, []);
  const useRecorder = canRecord() && server === true;
  const toggle = async () => {
    if (busy) return;
    if (listening) {
      stopRef.current?.();
      return;
    }
    onError(null);
    stopSpeaking();
    unlockSpeech();
    markVoiceTurn();
    setListening(true);
    if (useRecorder) {
      // Kullanıcı durdurana kadar kayıt; sonra sunucuda yazıya çevrilir.
      onText('');
      const started = Date.now();
      let level = 0;
      const tickStatus = () => onStatus?.({ phase: 'recording', seconds: Math.floor((Date.now() - started) / 1000), level });
      tickStatus();
      const clock = setInterval(tickStatus, 250);
      stopRef.current = await startRecording({
        onError: (e) => onError(MIC_ERRORS[e]),
        onLevel: (l) => {
          level = l;
        },
        onDone: async (audio) => {
          clearInterval(clock);
          setListening(false);
          stopRef.current = null;
          if (!audio) {
            onStatus?.(null);
            return;
          }
          onStatus?.({ phase: 'transcribing' });
          setBusy(true);
          try {
            const text = await transcribeAudio(audio);
            if (text) onText(text);
            else onError(MIC_ERRORS['no-speech']);
          } catch (err) {
            onError(err instanceof Error ? err.message : MIC_ERRORS.other);
          } finally {
            setBusy(false);
            onStatus?.(null);
          }
        },
      });
      return;
    }
    stopRef.current = startListening({
      onText: (text) => onText(text),
      onEnd: () => setListening(false),
      onError: (e) => onError(MIC_ERRORS[e]),
    });
  };
  return (
    <View style={{ paddingBottom: (t.size.control - t.size.touchMin) / 2 }}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={busy ? 'Yazıya çevriliyor' : listening ? 'Dinlemeyi durdur' : 'Konuşarak sor'}
        style={({ pressed }) => ({
          width: t.size.touchMin,
          height: t.size.touchMin,
          borderRadius: t.radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: listening ? t.colors.danger : pressed ? t.colors.brandStrong : t.colors.brand,
        })}
      >
        {busy ? (
          <ActivityIndicator color={t.colors.onBrand} />
        ) : (
          <Icon name={listening ? 'stop' : 'mic-outline'} size={t.size.iconSm} colorValue={t.colors.onBrand} />
        )}
      </Pressable>
    </View>
  );
}

// Gönder düğmesi: marka rengi (asistan bakırı değil), en az 44px kare.
function SendButton({ onPress, canSend }: { onPress: () => void; canSend: boolean }) {
  const t = useTheme();
  return (
    <View style={{ paddingBottom: (t.size.control - t.size.touchMin) / 2 }}>
      <Pressable
        onPress={canSend ? onPress : undefined}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityLabel="Gönder"
        accessibilityState={{ disabled: !canSend }}
        style={({ pressed }) => ({
          width: t.size.touchMin,
          height: t.size.touchMin,
          borderRadius: t.radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed && canSend ? t.colors.brandStrong : t.colors.brand,
          opacity: canSend ? 1 : 0.4,
        })}
      >
        <Icon name="arrow-up-outline" size={t.size.iconSm} colorValue={t.colors.onBrand} />
      </Pressable>
    </View>
  );
}

// Sohbet ekranlarının ortak düzen ölçüleri. Renk/boşluk temadan geldiği için
// StyleSheet değil, tema alan küçük yardımcılar.
export function useChatStyles() {
  const t = useTheme();
  return {
    screen: { flex: 1, backgroundColor: t.colors.surface0 } as ViewStyle,
    flex: { flex: 1 } as ViewStyle,
    listContent: {
      paddingHorizontal: t.space[4],
      paddingTop: t.space[4],
      paddingBottom: t.space[6],
      gap: t.space[3],
    } as ViewStyle,
    assistantRow: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space[2], minWidth: 0 } as ViewStyle,
    assistantColumn: { flex: 1, minWidth: 0, gap: t.space[2] } as ViewStyle,
    examples: { gap: t.space[2] } as ViewStyle,
  };
}

// Örnek soru kutusu (boş sohbet): kenarlıklı, en az 44px.
export function ExampleRow({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Örnek soru: ${label}`}
      style={({ pressed }) => ({
        minHeight: t.size.touchMin,
        justifyContent: 'center',
        backgroundColor: pressed ? t.colors.surface2 : t.colors.surface1,
        borderWidth: 1,
        borderColor: t.colors.line,
        borderRadius: t.radius.md,
        paddingHorizontal: t.space[3],
        paddingVertical: t.space[2],
        minWidth: 0,
      })}
    >
      <Text style={[t.type.body16, { color: t.colors.ink }]}>{label}</Text>
    </Pressable>
  );
}
