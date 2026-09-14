import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { fetchVideo, fetchVideoPlayback, type VideoRef } from '../api/client';
import { colors, radius, spacing, typography } from '../theme';

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
export function PostVideo({ video }: Props) {
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

  if (current.status === 'error') {
    return (
      <View style={[styles.frame, styles.centered]}>
        <Ionicons name="alert-circle-outline" size={28} color={colors.surface} />
        <Text style={styles.stateText}>
          {current.errorReason === 'too_long'
            ? 'Video 60 saniyeden uzun olduğu için yayınlanamadı.'
            : 'Video işlenemedi.'}
        </Text>
      </View>
    );
  }

  if (current.status !== 'ready') {
    return (
      <View style={[styles.frame, styles.centered]}>
        <ActivityIndicator color={colors.surface} />
        <Text style={styles.stateText}>Video işleniyor, birazdan izlenebilir.</Text>
      </View>
    );
  }

  if (playing && playback) {
    return <InlinePlayer uri={playback.hlsUrl} />;
  }

  const duration = formatDuration(current.durationSeconds);
  return (
    <Pressable
      style={styles.frame}
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
      {playback ? <Image source={{ uri: playback.thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      <View style={styles.centered}>
        {playbackFailed ? (
          <>
            <Ionicons name="refresh" size={26} color={colors.surface} />
            <Text style={styles.stateText}>Video yüklenemedi, tekrar denemek için dokunun.</Text>
          </>
        ) : (
          <View style={styles.playButton}>
            {playback ? (
              <Ionicons name="play" size={30} color={colors.primary} style={styles.playIcon} />
            ) : (
              <ActivityIndicator color={colors.primary} />
            )}
          </View>
        )}
      </View>
      {duration ? (
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{duration}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// Oynatıcı yalnızca kullanıcı oynat'a basınca oluşuyor: akışta her video kartı
// için ayrı oynatıcı açmak hem pil hem veri harcardı.
function InlinePlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.play();
  });
  return <VideoView player={player} style={styles.frame} nativeControls contentFit="contain" />;
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    marginTop: spacing.sm,
    overflow: 'hidden',
    backgroundColor: colors.text,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  stateText: {
    ...typography.label,
    fontWeight: '400',
    color: colors.surface,
    textAlign: 'center',
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Üçgen simge görsel olarak sola kaymış durur; optik ortalama.
  playIcon: { marginLeft: 4 },
  durationBadge: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  durationText: { ...typography.caption, fontWeight: '600', color: colors.surface },
});
