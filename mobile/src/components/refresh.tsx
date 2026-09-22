import React from 'react';
import { RefreshControl } from 'react-native';
import { colorTokens, type Theme } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

// Aşağı çekip yenileme göstergesi uygulamanın marka rengiyle. Bileşen değil
// fonksiyon: ScrollView/FlatList `refreshControl` olarak doğrudan
// RefreshControl öğesi bekliyor (Android'de listeyi onun içine sarıyor),
// araya giren bir bileşen bunu bozar. Bu yüzden içinde hook çağrılamaz;
// temaya duyarlı olması için ya `theme` verilir ya da `useRefreshControl`
// kullanılır.
export function refreshControl(refreshing: boolean, onRefresh: () => void, theme?: Theme) {
  const c = theme?.colors ?? colorTokens.light;
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      colors={[c.brand]}
      tintColor={c.brand}
      progressBackgroundColor={c.surface1}
    />
  );
}

// Ekran gövdesinde çağrılan kısayol: temayı kendisi alır (koyu temada da doğru).
export function useRefreshControl(refreshing: boolean, onRefresh: () => void) {
  const t = useTheme();
  return refreshControl(refreshing, onRefresh, t);
}
