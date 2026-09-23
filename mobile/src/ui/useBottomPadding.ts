// Kaydırılan içeriğin alt boşluğu (tasarım incelemesi 2026-09-23): hiçbir şey
// alt sekme çubuğunun ya da telefonun alt güvenli alanının arkasında kalmasın.
// Sekme ekranında: sekme çubuğu yüksekliği + alt güvenli alan; sekme dışı
// (yığın) ekranda: space-10 + alt güvenli alan.
import { useContext } from 'react';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';

export function useBottomPadding(): number {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const inTabs = useContext(BottomTabBarHeightContext) !== undefined;
  return (inTabs ? t.size.tabbar : t.space[10]) + insets.bottom;
}
