import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { fetchVideo, fetchVideoPlayback, type VideoRef } from '../api/client';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from '../ui';

const POLL_MS = 5000;
const POLL_LIMIT_MS = 5 * 60 * 1000;

// Sunucunun verdiği izleme anahtarı 1 saat geçerli. Aynı video her kaydırmada
// yeniden anahtar istemesin diye 50 dakika bellekte tutuluyor (Cloudflare'in
// anahtar ucu hız sınırlı).
const PLAYBACK_TTL_MS = 50 * 60 * 1000;
const playbackCache = new Map<string, { hlsUrl: string; thumbnailUrl: string; fetchedAt: number }>();

function cachedPlayback(videoId: string) {
  const entry = playbackCache.get(videoId);
  return entry && Date.now() - entry.fetchedAt < PLAYBACK_TTL_MS ? entry : null;
}

function formatDuration(seconds: number | null) {
  if (seconds == null || seconds < 0) return '';
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

interface Props {
  video: VideoRef;
}

// Durum yalnızca ilk değerden başlıyor; çağıran taraf `key={video.id}` vermeli.
// Akış yeniden yüklenince eski "processing" nesnesi, yoklamayla öğrenilmiş
// "ready" durumunun üzerine yazılmasın diye props ile senkronize edilmiyor.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı. Oynatıcı çerçevesi
// her iki temada da koyu (`surfaceBrand`) — video kendi renginde okunsun.
export function PostVideo({ video }: Props) {
  const t = useTheme();
  const [current, setCurrent] = useState(video);
  const [playback, setPlayback] = useState(() => cachedPlayback(video.id));
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const [playing, setPlaying] = useState(false);

  // Cloudflare videoyu işlerken birkaç saniyede bir durumu yokla.
  useEffect(() => {
    if (current.status === 'ready' || current.status === 'error') return;
    let cancelled = false;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > POLL_LIMIT_MS) {
        clearInterval(timer);
        return;
      }
      fetchVideo(current.id)
        .then(({ video: fresh }) => {
          if (!cancelled) setCurrent(fresh);
        })
        .catch(() => {});
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [current.id, current.status]);

  // Hazır olunca küçük resim ve oynatma adresini al.
  useEffect(() => {
    if (current.status !== 'ready' || playback || playbackFailed) return;
    let cancelled = false;
    fetchVideoPlayback(current.id)
      .then((urls) => {
        const entry = { ...urls, fetchedAt: Date.now() };
        playbackCache.set(current.id, entry);
        if (!cancelled) setPlayback(entry);
      })
      .catch(() => {
        if (!cancelled) setPlaybackFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [current.id, current.status, playback, playbackFailed]);

  const frame = {
    width: '100%' as const,
    aspectRatio: 16 / 9,
    borderRadius: t.radius.md,
    // Üst boşluk yok: kart öğeleri arasındaki boşluğu PostCard `gap` ile veriyor.
    overflow: 'hidden' as const,
    backgroundColor: t.colors.surfaceBrand,
  };
  const centered = {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: t.space[2],
    padding: t.space[4],
  };
  const stateText = [t.type.body14, { color: t.colors.onBrand, textAlign: 'center' as const }];

  if (current.status === 'error') {
    return (
      <View style={[frame, centered]}>
        <Icon name="warning" size={t.size.icon} colorValue={t.colors.onBrand} />
        <Text style={stateText}>
          {current.errorReason === 'too_long'
            ? 'Video 60 saniyeden uzun olduğu için yayınlanamadı.'
            : 'Video işlenemedi.'}
        </Text>
      </View>
    );
  }

  if (current.status !== 'ready') {
    return (
      <View style={[frame, centered]}>
        <ActivityIndicator color={t.colors.onBrand} />
        <Text style={stateText}>Video işleniyor, birazdan izlenebilir.</Text>
      </View>
    );
  }

  if (playing && playback) {
    return <InlinePlayer uri={playback.hlsUrl} />;
  }

  const duration = formatDuration(current.durationSeconds);
  return (
    <Pressable
      style={frame}
      onPress={() => {
        if (playbackFailed) {
          setPlaybackFailed(false);
          return;
        }
        if (playback) setPlaying(true);
      }}
      accessibilityRole="button"
      accessibilityLabel={duration ? `Videoyu oynat, ${duration}` : 'Videoyu oynat'}
    >
      {playback ? (
        <Image source={{ uri: playback.thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}
      <View style={centered}>
        {playbackFailed ? (
          <>
            <Icon name="refresh-outline" size={t.size.icon} colorValue={t.colors.onBrand} />
            <Text style={stateText}>Video yüklenemedi, tekrar denemek için dokunun.</Text>
          </>
        ) : (
          <View
            style={{
              // Dokunma hedefi: çerçevenin tamamı basılabilir, düğme görseli 52px.
              width: t.size.controlLg,
              height: t.size.controlLg,
              borderRadius: t.radius.full,
              backgroundColor: t.colors.surface1,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {playback ? (
              // Üçgen simge görsel olarak sola kaymış durur; optik ortalama.
              // (`Icon`in `style` prop'u yok, bu yüzden saran View ile kaydırıldı.)
              <View style={{ marginLeft: t.space[1] }}>
                <Icon name="play" size={t.size.icon} color="brand" />
              </View>
            ) : (
              <ActivityIndicator color={t.colors.brand} />
            )}
          </View>
        )}
      </View>
      {duration ? (
        <View
          style={{
            position: 'absolute',
            right: t.space[2],
            bottom: t.space[2],
            backgroundColor: t.colors.overlay,
            borderRadius: t.radius.sm,
            paddingHorizontal: t.space[2],
            paddingVertical: t.space[1],
          }}
        >
          <Text style={[t.type.caption12, { color: t.colors.onBrand }]}>{duration}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// Oynatıcı yalnızca kullanıcı oynat'a basınca oluşuyor: akışta her video kartı
// için ayrı oynatıcı açmak hem pil hem veri harcardı.
function InlinePlayer({ uri }: { uri: string }) {
  const t = useTheme();
  const player = useVideoPlayer(uri, (p) => {
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={{
        width: '100%',
        aspectRatio: 16 / 9,
        borderRadius: t.radius.md,
        overflow: 'hidden',
        backgroundColor: t.colors.surfaceBrand,
      }}
      nativeControls
      contentFit="contain"
    />
  );
}
