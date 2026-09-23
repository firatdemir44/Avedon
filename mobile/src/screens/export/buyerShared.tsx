// Aday alıcı ekranlarının ortak parçaları: takip durumları, puan rengi, durum seçme alt sayfası.
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { saveBuyerLead, type BuyerLeadStatus } from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import type { ColorTokens } from '../../theme/tokens';
import { BottomSheet, Button, Chip, Input } from '../../ui';
import type { BadgeKind } from '../../ui';

export const LEAD_STATUS: { key: BuyerLeadStatus; label: string; badge: BadgeKind }[] = [
  { key: 'yeni', label: 'Yeni', badge: 'new' },
  { key: 'inceleniyor', label: 'İnceleniyor', badge: 'info' },
  { key: 'iletisim', label: 'İletişim kuruldu', badge: 'info' },
  { key: 'numune', label: 'Numune gönderildi', badge: 'pending' },
  { key: 'siparis', label: 'Sipariş', badge: 'delivered' },
  { key: 'ilgisiz', label: 'İlgisiz', badge: 'cancelled' },
];
export const leadStatusOf = (k: BuyerLeadStatus) => LEAD_STATUS.find((s) => s.key === k) ?? LEAD_STATUS[0];

// Pazar puanıyla aynı renk ölçeği.
export function scoreColor(score: number): keyof ColorTokens {
  if (score >= 70) return 'success';
  if (score >= 50) return 'warning';
  return 'ink2';
}

export function LeadStatusSheet({
  buyer,
  onClose,
  onSaved,
}: {
  buyer: { id: string; name: string; lead: { status: BuyerLeadStatus; note: string } | null } | null;
  onClose: () => void;
  onSaved: (buyerId: string, lead: { status: BuyerLeadStatus; note: string }) => void;
}) {
  const t = useTheme();
  const [status, setStatus] = useState<BuyerLeadStatus>('yeni');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!buyer) return;
    setStatus(buyer.lead?.status ?? 'inceleniyor');
    setNote(buyer.lead?.note ?? '');
    setError(null);
  }, [buyer]);

  const save = async () => {
    if (!buyer) return;
    setSaving(true);
    setError(null);
    try {
      const res = await saveBuyerLead(buyer.id, status, note.trim());
      haptics.success();
      onSaved(buyer.id, res.lead);
      onClose();
    } catch (err) {
      setError(friendlyMessage(err, 'Kaydedilemedi'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet visible={!!buyer} onClose={onClose} title={buyer?.name}>
      <View style={{ gap: t.space[4] }}>
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>Bu firmayla nerede olduğunuzu işaretleyin; takip listenizde durumuna göre görünür.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
          {LEAD_STATUS.map((s) => (
            <Chip
              key={s.key}
              label={s.label}
              selected={status === s.key}
              onPress={() => {
                haptics.selection();
                setStatus(s.key);
              }}
            />
          ))}
        </View>
        <Input label="Not (isteğe bağlı)" value={note} onChangeText={setNote} placeholder="Ör. satın almacıya e-posta atıldı" multiline maxLength={1000} />
        {error ? <Text style={[t.type.body14, { color: t.colors.danger }]}>{error}</Text> : null}
        <Button kind="primary" label="Kaydet" onPress={save} loading={saving} fullWidth />
      </View>
    </BottomSheet>
  );
}
