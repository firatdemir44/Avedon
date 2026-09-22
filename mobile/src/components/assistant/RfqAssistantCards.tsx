import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import type { RfqCandidatesView, RfqSummaryView } from '../../features/assistant/toolResult';
import { companyCountOf, type RfqSelectionItem } from '../../features/quotes/rfqSelection';
import { haptics } from '../../features/haptics';
import { useTheme } from '../../theme/ThemeContext';
import { Button, Card, Icon } from '../../ui';

// Faz 3, Adım 2: asistanın teklif kartları. Hafıza / izleme kartlarının görsel
// dili (Card: surface1, 1px line, radius.lg) ama içinde seçim var.
//
// KURAL: asistan teklif isteğini KENDİSİ GÖNDERMEZ. Kart yalnızca aday önerir;
// istek, kullanıcı forma geçip onayladığında gider.
//
// Ham hex / ham px yok: her değer `useTheme()` token'ı ya da `src/ui` bileşeni.
// Sohbette birden çok kart olabildiği için kart düğmeleri "kenarlıklı"dır
// (ekranda en fazla 1 dolu düğme kuralı).

export function RfqCandidatesCard({
  view,
  onOpenProduct,
  onRequest,
}: {
  view: RfqCandidatesView;
  onOpenProduct: (productId: string) => void;
  onRequest: (items: RfqSelectionItem[], prefill: RfqCandidatesView['request']) => void;
}) {
  const t = useTheme();
  // Varsayılan: hepsi işaretli. Eski mesajlarda kart yeniden çizilince de
  // aynı şekilde kurulur (seçim sunucuda tutulmuyor, ekranda yaşıyor).
  const [selected, setSelected] = useState<string[]>(() => view.candidates.map((c) => c.id));

  const chosen = view.candidates.filter((c) => selected.includes(c.id));
  const items: RfqSelectionItem[] = chosen.map((c) => ({
    id: c.id,
    code: c.code,
    companyId: c.companyId,
    companyName: c.companyName,
    stockUnit: c.stockUnit,
    type: c.type,
  }));
  const companyCount = companyCountOf(items);
  const canRequest = companyCount >= 2;

  const toggle = (id: string) => {
    haptics.selection();
    setSelected((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  return (
    <Card style={{ gap: t.space[2] }}>
      <Text style={[t.type.title18, { color: t.colors.ink }]} accessibilityRole="header">
        Teklif toplama adayları
      </Text>

      {view.candidates.map((candidate, index) => {
        const isSelected = selected.includes(candidate.id);
        return (
          <View
            key={candidate.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.space[2],
              minWidth: 0,
              borderBottomWidth: index < view.candidates.length - 1 ? 1 : 0,
              borderBottomColor: t.colors.line,
            }}
          >
            {/* Onay kutusu ve "Ürünü aç" KARDEŞ düğmeler: web'de iç içe buton olmasın. */}
            <Pressable
              onPress={() => toggle(candidate.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={`${candidate.code}, ${candidate.companyName}, ${candidate.summary}`}
              style={({ pressed }) => ({
                flex: 1,
                minWidth: 0,
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.space[2],
                minHeight: t.size.touchMin,
                paddingVertical: t.space[2],
                backgroundColor: pressed ? t.colors.surface2 : 'transparent',
              })}
            >
              <Icon
                name={isSelected ? 'checkbox-outline' : 'square-outline'}
                size={t.size.iconSm}
                color={isSelected ? 'brand' : 'lineStrong'}
              />
              <View style={{ flex: 1, minWidth: 0, gap: t.space[1] / 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[1], minWidth: 0 }}>
                  <Text style={[t.type.mono14, { color: t.colors.brand }]} numberOfLines={1}>
                    {candidate.code}
                  </Text>
                  <Text style={[t.type.body14, { color: t.colors.ink2, flexShrink: 1, minWidth: 0 }]} numberOfLines={1}>
                    {candidate.companyName}
                  </Text>
                  {candidate.verified ? (
                    <Icon name="checkmark-circle-outline" size={t.size.iconXs} color="success" />
                  ) : null}
                </View>
                {candidate.summary ? (
                  <Text style={[t.type.body14, { color: t.colors.ink3 }]} numberOfLines={2}>
                    {candidate.summary}
                  </Text>
                ) : null}
              </View>
            </Pressable>
            <Pressable
              onPress={() => onOpenProduct(candidate.id)}
              hitSlop={t.space[2]}
              accessibilityRole="button"
              accessibilityLabel={`${candidate.code} ürününü aç`}
              style={({ pressed }) => ({
                minHeight: t.size.touchMin,
                justifyContent: 'center',
                paddingLeft: t.space[2],
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={[t.type.label14, { color: t.colors.brand }]}>Ürünü aç</Text>
            </Pressable>
          </View>
        );
      })}

      <Button
        kind="secondary"
        label={`Seçilenlerden teklif iste (${companyCount} firma)`}
        disabled={!canRequest}
        fullWidth
        onPress={() => onRequest(items, view.request)}
      />
      {!canRequest ? <Text style={[t.type.body14, { color: t.colors.ink2 }]}>En az 2 firma seçin.</Text> : null}
      <Text style={[t.type.body14, { color: t.colors.ink3 }]}>
        İstek siz onaylamadan gitmez. Satıcılar başka kaç firmaya sorduğunuzu görmez.
      </Text>
    </Card>
  );
}

// "N firmaya soruldu · M teklif geldi" + karşılaştırma bağlantısı.
export function RfqSummaryCard({ view, onOpen }: { view: RfqSummaryView; onOpen: (rfqId: string) => void }) {
  const t = useTheme();
  return (
    <Card style={{ gap: t.space[2] }}>
      <Text style={[t.type.title18, { color: t.colors.ink }]} accessibilityRole="header">
        {view.title}
      </Text>
      <Text style={[t.type.body16, { color: t.colors.ink }]}>
        {view.requestCount} firmaya soruldu · {view.quotedCount} teklif geldi
      </Text>
      <Pressable
        onPress={() => onOpen(view.rfqId)}
        accessibilityRole="button"
        accessibilityLabel={`${view.title} karşılaştırmasını aç`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[1],
          alignSelf: 'flex-start',
          minHeight: t.size.touchMin,
          paddingRight: t.space[2],
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text style={[t.type.label14, { color: t.colors.brand }]}>Karşılaştırmayı aç</Text>
        <Icon name="chevron" size={t.size.iconSm} color="brand" />
      </Pressable>
    </Card>
  );
}
