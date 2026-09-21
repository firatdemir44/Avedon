import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  addProductVideo,
  fetchProductVideos,
  removeProductVideo,
  type VideoRef,
} from '../api/client';
import { confirmAction } from '../features/confirm';
import { haptics } from '../features/haptics';
import { useVideoUpload, videoErrorMessage } from '../features/useVideoUpload';
import { MAX_VIDEO_SECONDS } from '../features/videoUpload';
import { InlineError } from './StateView';
import { PostVideo } from './PostVideo';
import { PrimaryButton } from './PrimaryButton';
import { SectionHeader } from './SectionHeader';
import { colors, spacing, typography } from '../theme';

interface Props {
  productId: string;
  // Ürün, kullanıcının kendi firmasının mı: ekleme ve kaldırma yalnızca onda.
  isOwner: boolean;
}

// Ürün sayfasındaki "Videolar" bölümü (kumaş ve iplik aynı ekran, ikisinde de
// çalışır). Veri çekimi bölümün kendi içinde ve SESSİZ: hata olursa ya da hiç
// video yoksa bölüm başkasına hiç görünmez (benzer kumaşlar deseni). Sahibine
// video olmasa da görünür, çünkü "Video ekle" düğmesi orada.
export function ProductVideos({ productId, isOwner }: Props) {
  const [videos, setVideos] = useState<VideoRef[] | null>(null);
  const [max, setMax] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const videoUpload = useVideoUpload({ onError: setError });

  const load = useCallback(() => {
    let cancelled = false;
    fetchProductVideos(productId)
      .then((result) => {
        if (cancelled) return;
        setVideos(result.videos);
        setMax(result.max);
      })
      .catch(() => {
        // Sessiz: bölüm gizli kalır.
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  useEffect(() => {
    setVideos(null);
    setError(null);
    return load();
  }, [load]);

  const addVideo = async () => {
    setError(null);
    const ref = await videoUpload.pickAndUpload();
    if (!ref) return;
    setAttaching(true);
    try {
      // Video "processing" iken de bağlanabilir; oynatıcı hazır olana kadar
      // "Video işleniyor..." gösterir.
      const result = await addProductVideo(productId, ref.id);
      videoUpload.markAttached();
      setVideos(result.videos);
      setMax(result.max);
      haptics.success();
    } catch (err) {
      // Bağlanamadıysa yüklenen dosya Cloudflare'de sahipsiz kalmasın.
      videoUpload.remove();
      setError(videoErrorMessage(err));
    } finally {
      setAttaching(false);
    }
  };

  const remove = async (videoId: string) => {
    const ok = await confirmAction({
      title: 'Video kaldırılsın mı?',
      message: 'Video ürün sayfasından kaldırılacak ve tamamen silinecek.',
      confirmLabel: 'Kaldır',
      destructive: true,
    });
    if (!ok) return;
    setBusyId(videoId);
    setError(null);
    try {
      await removeProductVideo(productId, videoId);
      setVideos((prev) => (prev ?? []).filter((v) => v.id !== videoId));
      haptics.success();
    } catch {
      setError('Video kaldırılamadı, tekrar deneyin.');
    } finally {
      setBusyId(null);
    }
  };

  if (videos === null) return null;
  if (!isOwner && videos.length === 0) return null;

  const uploading = videoUpload.video?.phase === 'uploading';
  const progress = videoUpload.video?.phase === 'uploading' ? videoUpload.video.progress : 0;
  const canAdd = isOwner && videos.length < max && !uploading && !attaching;

  return (
    <View>
      <SectionHeader title="Videolar" count={videos.length || undefined} style={styles.sectionHeader} />
      <View style={styles.block}>
        {videos.map((video) => (
          <View key={video.id} style={styles.item}>
            <PostVideo video={video} />
            {isOwner ? (
              <PrimaryButton
                label={busyId === video.id ? 'Kaldırılıyor...' : 'Kaldır'}
                variant="outline"
                size="sm"
                disabled={busyId === video.id}
                accessibilityLabel="Bu videoyu kaldır"
                onPress={() => remove(video.id)}
                style={styles.removeButton}
              />
            ) : null}
          </View>
        ))}

        {videos.length === 0 && isOwner && !uploading && !attaching ? (
          <Text style={styles.hint}>
            Bu ürüne en fazla {max} video ekleyebilirsiniz (her biri en çok {MAX_VIDEO_SECONDS} saniye).
          </Text>
        ) : null}

        {uploading || attaching ? (
          <View style={styles.progressBox}>
            <Text style={styles.progressText}>
              {attaching
                ? 'Video ürüne ekleniyor...'
                : progress >= 0.999
                  ? 'Yükleme tamamlanıyor, Cloudflare onayı bekleniyor...'
                  : `Video yükleniyor %${Math.round(progress * 100)}`}
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round((attaching ? 1 : progress) * 100)}%` }]} />
            </View>
          </View>
        ) : null}

        {error ? <InlineError message={error} /> : null}

        {canAdd ? (
          <PrimaryButton label="Video ekle" icon="videocam-outline" variant="outline" onPress={addVideo} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { marginTop: spacing.sm },
  block: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.gutter,
    gap: spacing.sm,
  },
  item: { gap: spacing.xs },
  removeButton: { alignSelf: 'flex-start' },
  hint: { ...typography.caption, color: colors.textMuted },
  progressBox: { gap: spacing.xs },
  progressText: { ...typography.label, color: colors.text },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.chip, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: colors.primary },
});
