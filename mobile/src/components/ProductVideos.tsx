import React, { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
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
import { useTheme } from '../theme/ThemeContext';
import { Button, Card, SectionTitle } from '../ui';
import { tr } from '../i18n';

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
  const t = useTheme();
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
      title: tr('Video kaldırılsın mı?'),
      message: tr('Video ürün sayfasından kaldırılacak ve tamamen silinecek.'),
      confirmLabel: tr('Kaldır'),
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
      setError(tr('Video kaldırılamadı, tekrar deneyin.'));
    } finally {
      setBusyId(null);
    }
  };

  if (videos === null) return null;
  if (!isOwner && videos.length === 0) return null;

  const uploading = videoUpload.video?.phase === 'uploading';
  const progress = videoUpload.video?.phase === 'uploading' ? videoUpload.video.progress : 0;
  const canAdd = isOwner && videos.length < max && !uploading && !attaching;
  const fill = Math.round((attaching ? 1 : progress) * 100);

  return (
    <View style={{ gap: t.space[3] }}>
      <SectionTitle title={videos.length ? tr('Videolar ({n})', { n: videos.length }) : tr('Videolar')} />
      <Card style={{ gap: t.space[3] }}>
        {videos.map((video) => (
          <View key={video.id} style={{ gap: t.space[2] }}>
            <PostVideo video={video} />
            {isOwner ? (
              <Button
                kind="secondary"
                label={busyId === video.id ? tr('Kaldırılıyor...') : tr('Kaldır')}
                disabled={busyId === video.id}
                accessibilityLabel={tr('Bu videoyu kaldır')}
                onPress={() => remove(video.id)}
              />
            ) : null}
          </View>
        ))}

        {videos.length === 0 && isOwner && !uploading && !attaching ? (
          <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
            {tr('Bu ürüne en fazla {max} video ekleyebilirsiniz (her biri en çok {s} saniye).', { max, s: MAX_VIDEO_SECONDS })}
          </Text>
        ) : null}

        {uploading || attaching ? (
          <View style={{ gap: t.space[2] }}>
            <Text style={[t.type.body14, { color: t.colors.ink }]}>
              {attaching
                ? tr('Video ürüne ekleniyor...')
                : progress >= 0.999
                  ? tr('Yükleme tamamlanıyor, Cloudflare onayı bekleniyor...')
                  : tr('Video yükleniyor %{p}', { p: Math.round(progress * 100) })}
            </Text>
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: fill }}
              style={{
                height: t.space[1],
                borderRadius: t.radius.full,
                backgroundColor: t.colors.surface2,
                overflow: 'hidden',
              }}
            >
              <View style={{ height: t.space[1], backgroundColor: t.colors.brand, width: `${fill}%` }} />
            </View>
          </View>
        ) : null}

        {error ? <InlineError message={error} /> : null}

        {canAdd ? (
          <Button kind="secondary" label={tr('Video ekle')} icon="videocam-outline" onPress={addVideo} />
        ) : null}
      </Card>
    </View>
  );
}
