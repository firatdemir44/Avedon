// Gönderi şikâyeti (akış düzeni, 2026-09-23): 5 neden + isteğe bağlı not.
// Farklı firmalardan gelen şikâyetlerde gönderi sunucuda otomatik gizlenir.
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { POST_REPORT_REASONS, reportPost, type PostReportReason } from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import { BottomSheet, Button, Chip, Input } from '../../ui';

const NOTE_MAX = 500;

export function ReportPostSheet({
  postId,
  visible,
  onClose,
}: {
  postId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const t = useTheme();
  const [reason, setReason] = useState<PostReportReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | 'new' | 'already'>(null);

  useEffect(() => {
    if (visible) {
      setReason(null);
      setNote('');
      setError(null);
      setDone(null);
    }
  }, [visible]);

  const submit = async () => {
    if (!reason || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await reportPost(postId, reason, note.trim() || undefined);
      haptics.success();
      setDone(res.already ? 'already' : 'new');
    } catch (err) {
      haptics.error();
      setError(friendlyMessage(err, 'Şikâyet gönderilemedi'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={done ? 'Şikâyetiniz alındı' : 'Gönderiyi şikâyet et'}>
      {done ? (
        <View style={{ gap: t.space[4] }}>
          <Text style={[t.type.body16, { color: t.colors.ink }]}>
            {done === 'already'
              ? 'Bu gönderiyi daha önce şikâyet etmiştiniz. Teşekkürler, inceleyeceğiz.'
              : 'Teşekkürler, inceleyeceğiz. Farklı firmalardan gelen şikâyetlerde gönderi otomatik gizlenir.'}
          </Text>
          <Button label="Tamam" onPress={onClose} fullWidth />
        </View>
      ) : (
        <View style={{ gap: t.space[4] }}>
          <Text style={[t.type.body14, { color: t.colors.ink2 }]}>Neden şikâyet ediyorsunuz?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            {POST_REPORT_REASONS.map((r) => (
              <Chip
                key={r.key}
                label={r.label}
                selected={reason === r.key}
                onPress={() => {
                  haptics.selection();
                  setReason(r.key);
                }}
              />
            ))}
          </View>
          <Input
            label="Not (isteğe bağlı)"
            value={note}
            onChangeText={(v) => setNote(v.slice(0, NOTE_MAX))}
            placeholder="Kısaca açıklayabilirsiniz"
            multiline
          />
          {error ? <Text style={[t.type.body14, { color: t.colors.danger }]}>{error}</Text> : null}
          <Button
            label="Şikâyeti gönder"
            onPress={submit}
            disabled={!reason}
            loading={busy}
            fullWidth
          />
        </View>
      )}
    </BottomSheet>
  );
}
