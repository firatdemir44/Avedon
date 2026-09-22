// Sohbet (yeni tasarım, 4. adım — DESIGN.md §3 "Paylaşım/balon" kuralları).
//
// Balonlar: asistan/karşı taraf SOLDA `surface1` + 1px `line`; kendi mesajın
// SAĞDA `brand` / `onBrand`. Altta yapışkan yazma alanı: 48px giriş,
// `surface1` zemin, üst kenarlık `line`, `shadowRaised`.
//
// Veri katmanı, yoklama (poll), iyimser gönderim ve video akışı DEĞİŞMEDİ;
// yalnızca görünüm yeni. Ham hex / ham px yok: her değer `useTheme()` token'ı
// ya da `src/ui` bileşeni.
import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  AppState,
  Platform,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { useVideoUpload } from '../../features/useVideoUpload';
import { PostVideo } from '../../components/PostVideo';
import { formatClockTime, formatDayLabel, isSameCalendarDay } from '../../features/time';
import { haptics } from '../../features/haptics';
import { UserAvatar } from '../../components/UserAvatar';
import { friendlyMessage } from '../../components/StateView';
import { useTheme } from '../../theme/ThemeContext';
import { EmptyState, Icon, SkeletonRow } from '../../ui';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

type LocalMessage = ChatMessage & { pending?: boolean; failed?: boolean };

const POLL_INTERVAL_MS = 4000;
const NEAR_BOTTOM_THRESHOLD_PX = 80;

// Sunucu `since` filtresinde gte kullanıyor (aynı milisaniyedeki mesajlar
// kaçmasın diye), dolayısıyla gelen listede zaten bildiğimiz kayıtlar olabilir.
// Id'ye göre birleştirip iyimser (temp-) kayıtları gerçekleriyle değiştiriyoruz.
function mergeMessages(prev: LocalMessage[], incoming: ChatMessage[]): LocalMessage[] {
  if (incoming.length === 0) return prev;

  // Videolu mesajda yazı boş olabildiği için anahtara video kimliği de giriyor;
  // yoksa iki yazısız video mesajı birbirini yutardı.
  const key = (m: ChatMessage) => `${m.senderId}|${m.body}|${m.video?.id ?? ''}`;
  const arrived = new Set(incoming.map(key));
  const byId = new Map<string, LocalMessage>();

  for (const message of prev) {
    const isSupersededOptimistic = message.id.startsWith('temp-') && arrived.has(key(message));
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

export function ChatScreen({ navigation, route }: Props) {
  const t = useTheme();
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

  // Video ekleme: gönderi ekranındaki akışın aynısı (ortak kanca). Yüklenen
  // video mesaj olarak gönderilince "bağlandı" sayılır; gönderilmeden ekrandan
  // çıkılırsa kanca Cloudflare'deki dosyayı siler.
  const videoUpload = useVideoUpload({ onError: setError });
  const pendingVideo = videoUpload.uploadedRef;
  const uploadingVideo = videoUpload.uploading;
  const uploadProgress = videoUpload.video?.phase === 'uploading' ? videoUpload.video.progress : 0;
  const canSend = !sending && !uploadingVideo && (input.trim().length > 0 || !!pendingVideo);

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

  const deliver = async (body: string, tempId: string, videoId?: string) => {
    try {
      const { message } = await sendMessage(conversationId, body, videoId);
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
    const video = pendingVideo;
    if ((!body && !video) || sending || uploadingVideo) return;

    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        body,
        senderId: meId,
        createdAt: new Date().toISOString(),
        readAt: null,
        video: video ?? null,
        pending: true,
      },
    ]);
    setInput('');
    // Video artık mesaja bağlandı: kanca ekrandan çıkınca silmesin.
    if (video) videoUpload.markAttached();
    setSending(true);
    scrollToEnd();
    await deliver(body, tempId, video?.id);
  };

  const handleRetry = async (message: LocalMessage) => {
    if (sending) return;
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev.filter((m) => m.id !== message.id),
      { ...message, id: tempId, pending: true, failed: false, createdAt: new Date().toISOString() },
    ]);
    setSending(true);
    await deliver(message.body, tempId, message.video?.id);
  };

  const pickAndUploadVideo = async () => {
    if (uploadingVideo || sending) return;
    setError(null);
    await videoUpload.pickAndUpload();
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    isNearBottomRef.current =
      layoutMeasurement.height + contentOffset.y >= contentSize.height - NEAR_BOTTOM_THRESHOLD_PX;
  };

  // ——— Stiller: renkler temadan geldiği için bileşen gövdesinde üretiliyor ———
  const screenStyle = { flex: 1, backgroundColor: t.colors.surface0 } as const;

  const bubbleBase = {
    maxWidth: '80%' as const,
    borderRadius: t.radius.lg,
    paddingVertical: t.space[3],
    paddingHorizontal: t.space[3],
    marginBottom: t.space[2],
    gap: t.space[1],
  };
  const myBubble = { ...bubbleBase, alignSelf: 'flex-end' as const, backgroundColor: t.colors.brand };
  const otherBubble = {
    ...bubbleBase,
    alignSelf: 'flex-start' as const,
    backgroundColor: t.colors.surface1,
    borderWidth: 1,
    borderColor: t.colors.line,
  };
  const myText = [t.type.body16, { color: t.colors.onBrand }];
  const otherText = [t.type.body16, { color: t.colors.ink }];
  const metaStyle = (mine: boolean) => [
    t.type.caption12,
    { color: mine ? t.colors.onBrand : t.colors.ink3, alignSelf: 'flex-end' as const },
  ];
  const failedRow = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: t.space[1],
    alignSelf: 'flex-end' as const,
    minHeight: t.size.touchMin,
  };
  const squareButton = {
    width: t.size.control,
    height: t.size.control,
    borderRadius: t.radius.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  if (loading) {
    return (
      <View style={[screenStyle, { paddingHorizontal: t.space[4], paddingTop: t.space[4], gap: t.space[4] }]}>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }

  if (loadError && messages.length === 0) {
    return (
      <View style={[screenStyle, { paddingHorizontal: t.space[4], paddingBottom: insets.bottom }]}>
        <EmptyState
          icon="warning"
          title="Mesajlar alınamadı"
          description={friendlyMessage(loadError, 'Bağlantıyı kontrol edip tekrar deneyin.')}
          actionLabel="Tekrar dene"
          onAction={loadInitial}
        />
      </View>
    );
  }

  return (
    <View style={screenStyle}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: t.space[4],
            paddingTop: t.space[4],
            paddingBottom: t.space[2],
          }}
          onScroll={handleScroll}
          scrollEventThrottle={100}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              icon="messages"
              title="İlk mesajı siz yazın"
              description="Aşağıdaki alana yazıp gönderin."
            />
          }
          renderItem={({ item, index }) => {
            const isMine = item.senderId === meId;
            const previous = messages[index - 1];
            const startsNewDay =
              !previous || !isSameCalendarDay(new Date(previous.createdAt), new Date(item.createdAt));
            // Gün ayracı: ortada çip. Dokunulmaz, bu yüzden 44px kuralı geçerli değil.
            const dayChip = startsNewDay ? (
              <View
                style={{
                  alignSelf: 'center',
                  backgroundColor: t.colors.surface2,
                  borderRadius: t.radius.full,
                  paddingHorizontal: t.space[3],
                  paddingVertical: t.space[1],
                  marginBottom: t.space[2],
                }}
              >
                <Text style={[t.type.caption12, { color: t.colors.ink2 }]}>{formatDayLabel(item.createdAt)}</Text>
              </View>
            ) : null;

            // Teklif bağlantılı mesaj: balon yerine kart (Faz 2, Adım 2).
            // Dış kap Pressable DEĞİL: içindeki "Teklifi aç" düğmesiyle web'de
            // iç içe <button> oluşmasın.
            if (item.quoteRequestId) {
              const quoteRequestId = item.quoteRequestId;
              return (
                <>
                  {dayChip}
                  <View style={[otherBubble, isMine && { alignSelf: 'flex-end' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[1] }}>
                      <Icon name="quote" size={t.size.iconSm} color="brand" />
                      <Text style={[t.type.label14, { color: t.colors.brand }]}>Teklif</Text>
                    </View>
                    <Text style={otherText}>{item.body}</Text>
                    <Pressable
                      onPress={() => navigation.navigate('QuoteRequestDetail', { requestId: quoteRequestId })}
                      accessibilityRole="button"
                      accessibilityLabel="Teklifi aç"
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: t.space[1],
                        minHeight: t.size.touchMin,
                        opacity: pressed ? 0.6 : 1,
                      })}
                    >
                      <Text style={[t.type.label14, { color: t.colors.brand }]}>Teklifi aç</Text>
                      <Icon name="chevron" size={t.size.iconSm} color="brand" />
                    </Pressable>
                    <Text style={metaStyle(false)}>{formatClockTime(item.createdAt)}</Text>
                  </View>
                </>
              );
            }

            // Videolu mesaj: balonun içinde akıştaki oynatıcı. Dış kap
            // Pressable DEĞİL — oynatıcının kendisi dokunulabilir, web'de iç
            // içe düğme olmasın. Balon yüzde genişlikte, çünkü oynatıcı 16:9
            // oranını kendi genişliğinden hesaplıyor.
            if (item.video) {
              const video = item.video;
              return (
                <>
                  {dayChip}
                  <View
                    style={[
                      isMine ? myBubble : otherBubble,
                      { width: '80%' },
                      item.failed ? { opacity: 0.75 } : null,
                    ]}
                  >
                    <PostVideo key={video.id} video={video} />
                    {item.body ? <Text style={isMine ? myText : otherText}>{item.body}</Text> : null}
                    {item.failed ? (
                      <Pressable
                        onPress={() => handleRetry(item)}
                        accessibilityRole="button"
                        accessibilityLabel="Gönderilemedi. Tekrar denemek için dokunun."
                        style={({ pressed }) => [failedRow, pressed ? { opacity: 0.6 } : null]}
                      >
                        <Icon
                          name="warning"
                          size={t.size.iconXs}
                          colorValue={isMine ? t.colors.onBrand : t.colors.danger}
                        />
                        <Text
                          style={[t.type.caption12, { color: isMine ? t.colors.onBrand : t.colors.danger }]}
                        >
                          Gönderilemedi. Tekrar denemek için dokunun.
                        </Text>
                      </Pressable>
                    ) : (
                      <Text style={metaStyle(isMine)}>
                        {item.pending ? 'Gönderiliyor' : formatClockTime(item.createdAt)}
                      </Text>
                    )}
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
                    isMine ? myBubble : otherBubble,
                    item.failed ? { opacity: 0.75 } : null,
                    pressed && item.failed ? { opacity: 0.6 } : null,
                  ]}
                >
                  <Text style={isMine ? myText : otherText}>{item.body}</Text>
                  {item.failed ? (
                    <View style={failedRow}>
                      <Icon
                        name="warning"
                        size={t.size.iconXs}
                        colorValue={isMine ? t.colors.onBrand : t.colors.danger}
                      />
                      <Text style={[t.type.caption12, { color: isMine ? t.colors.onBrand : t.colors.danger }]}>
                        Gönderilemedi. Tekrar denemek için dokunun.
                      </Text>
                    </View>
                  ) : (
                    <Text style={metaStyle(isMine)}>
                      {item.pending ? 'Gönderiliyor' : formatClockTime(item.createdAt)}
                    </Text>
                  )}
                </Pressable>
              </>
            );
          }}
        />

        {error ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.space[2],
              marginHorizontal: t.space[4],
              marginBottom: t.space[2],
              padding: t.space[3],
              borderRadius: t.radius.md,
              backgroundColor: t.colors.dangerSoft,
            }}
          >
            <Icon name="warning" size={t.size.iconSm} color="danger" />
            <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{error}</Text>
          </View>
        ) : null}

        {/* Yükleme / gönderilmeyi bekleyen video şeridi (yazı kutusunun üstünde,
            composer satırı 375px'te taşmasın diye). */}
        {uploadingVideo || pendingVideo ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.space[2],
              marginHorizontal: t.space[4],
              marginBottom: t.space[2],
              paddingHorizontal: t.space[3],
              paddingVertical: t.space[2],
              borderRadius: t.radius.md,
              backgroundColor: t.colors.surface1,
              borderWidth: 1,
              borderColor: t.colors.line,
            }}
          >
            <Icon name="videocam-outline" size={t.size.iconSm} color="brand" />
            <Text style={[t.type.body14, { color: t.colors.ink, flex: 1, minWidth: 0 }]} numberOfLines={1}>
              {uploadingVideo
                ? uploadProgress >= 0.999
                  ? 'Yükleme tamamlanıyor...'
                  : `Video yükleniyor %${Math.round(uploadProgress * 100)}`
                : 'Video hazır. Göndere basın.'}
            </Text>
            {!uploadingVideo ? (
              <Pressable
                onPress={videoUpload.remove}
                accessibilityRole="button"
                accessibilityLabel="Videoyu kaldır"
                hitSlop={10}
                style={({ pressed }) => ({
                  width: t.size.touchMin,
                  height: t.size.touchMin,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Icon name="x" size={t.size.iconSm} color="ink2" />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Yapışkan yazma alanı (DESIGN.md §2 yapışkan alt çubuk kuralı). */}
        <View
          style={[
            {
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: t.space[2],
              backgroundColor: t.colors.surface1,
              borderTopWidth: 1,
              borderTopColor: t.colors.line,
              paddingHorizontal: t.space[4],
              paddingTop: t.space[3],
              paddingBottom: insets.bottom + t.space[3],
            },
            t.shadowRaised,
          ]}
        >
          <Pressable
            onPress={pickAndUploadVideo}
            disabled={uploadingVideo || !!pendingVideo || sending}
            accessibilityRole="button"
            accessibilityLabel="Video ekle"
            accessibilityState={{ disabled: uploadingVideo || !!pendingVideo || sending }}
            style={({ pressed }) => [
              squareButton,
              {
                borderWidth: 1,
                borderColor: t.colors.lineStrong,
                backgroundColor: t.colors.surface1,
                opacity: uploadingVideo || !!pendingVideo || sending ? 0.4 : pressed ? 0.6 : 1,
              },
            ]}
          >
            <Icon name="videocam-outline" size={t.size.iconSm} color="brand" />
          </Pressable>
          <TextInput
            style={[
              t.type.body16,
              {
                flex: 1,
                // RN web: flex öğesi içeriğinden daralmazsa uzun yazıda satır taşar.
                minWidth: 0,
                minHeight: t.size.control,
                maxHeight: t.size.control * 2.5,
                borderWidth: 1,
                borderColor: t.colors.lineStrong,
                borderRadius: t.radius.md,
                backgroundColor: t.colors.surface1,
                paddingHorizontal: t.space[3],
                paddingVertical: t.space[3],
                color: t.colors.ink,
              },
            ]}
            placeholder="Mesaj yazın"
            placeholderTextColor={t.colors.ink3}
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
            style={({ pressed }) => [
              squareButton,
              {
                backgroundColor: pressed && canSend ? t.colors.brandStrong : t.colors.brand,
                opacity: canSend ? 1 : 0.4,
              },
            ]}
          >
            <Icon name="send" size={t.size.iconSm} colorValue={t.colors.onBrand} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// Sohbet başlığı: karşı tarafın fotoğrafı + adı. Stack başlığı marka renginde
// olduğu için avatar "onPrimary" görünümde ve yazı `onBrand`.
export function ChatHeaderTitle({
  title,
  userId,
  avatarUpdatedAt,
}: {
  title: string;
  userId: string;
  avatarUpdatedAt?: string | null;
}) {
  const t = useTheme();
  const [firstName, ...rest] = title.split(' ');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
      <UserAvatar
        userId={userId}
        firstName={firstName}
        lastName={rest.join(' ')}
        avatarUpdatedAt={avatarUpdatedAt}
        size={t.size.avatarSm}
        variant="onPrimary"
      />
      <Text style={[t.type.title18, { color: t.colors.onBrand, flexShrink: 1 }]} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}
