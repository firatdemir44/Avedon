import React from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RfqSelection } from '../features/quotes/rfqSelection';
import { useTheme } from '../theme/ThemeContext';
import { Button, Icon } from '../ui';
import { tr } from '../i18n';

// Çoklu teklif seçimi açıkken ekranın altına sabitlenen şerit (Faz 3, Adım 1).
// DESIGN.md §2 yapışkan alt çubuk: surface-1, üst kenarlık line, shadow-raised.
// Sayılan şey ürün değil FİRMA: istek firma başına tek gider.
export function RfqSelectionBar({ selection, onSubmit }: { selection: RfqSelection; onSubmit: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { items, companyCount, hasDuplicateCompany, manyCompanies, limitNote } = selection;
  const canSubmit = companyCount >= 2;

  return (
    <View
      style={[
        {
          backgroundColor: t.colors.surface1,
          borderTopWidth: 1,
          borderTopColor: t.colors.line,
          paddingHorizontal: t.space[4],
          paddingTop: t.space[3],
          paddingBottom: insets.bottom + t.space[3],
          gap: t.space[1],
        },
        t.shadowRaised,
      ]}
    >
      <Text style={[t.type.label14, { color: t.colors.ink }]}>
        {tr('{n} ürün · {c} firma seçildi', { n: items.length, c: companyCount })}
      </Text>
      {!canSubmit ? (
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{tr('En az 2 farklı firmadan ürün seçin.')}</Text>
      ) : null}
      {hasDuplicateCompany ? (
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
          {tr('Aynı firmadan yalnızca ilk seçtiğiniz ürün için istek gider.')}
        </Text>
      ) : null}
      {manyCompanies ? (
        <Text style={[t.type.body14, { color: t.colors.warning }]}>{tr("5'ten fazla firmaya sorunca cevap oranı düşebilir.")}</Text>
      ) : null}
      {limitNote ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.space[2],
            padding: t.space[2],
            borderRadius: t.radius.md,
            backgroundColor: t.colors.dangerSoft,
          }}
        >
          <Icon name="warning" size={t.size.iconSm} color="danger" />
          <Text style={[t.type.body14, { color: t.colors.danger, flexShrink: 1 }]}>{limitNote}</Text>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: t.space[2], paddingTop: t.space[2] }}>
        <Button kind="secondary" label={tr('Vazgeç')} onPress={selection.cancel} />
        <Button
          label={tr('Teklif iste')}
          disabled={!canSubmit}
          onPress={onSubmit}
          style={{ flex: 1 }}
          accessibilityLabel={tr('Teklif iste, {c} firma', { c: companyCount })}
        />
      </View>
    </View>
  );
}
