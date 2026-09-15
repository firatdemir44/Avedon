import React from 'react';
import { RefreshControl } from 'react-native';
import { colors } from '../theme';

// Aşağı çekip yenileme göstergesi uygulamanın lacivertiyle. Bileşen değil
// fonksiyon: ScrollView/FlatList `refreshControl` olarak doğrudan
// RefreshControl öğesi bekliyor (Android'de listeyi onun içine sarıyor),
// araya giren bir bileşen bunu bozar.
export function refreshControl(refreshing: boolean, onRefresh: () => void) {
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      colors={[colors.primary]}
      tintColor={colors.primary}
      progressBackgroundColor={colors.surface}
    />
  );
}
