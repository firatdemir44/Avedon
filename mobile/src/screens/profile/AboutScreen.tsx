// Hakkında (Fırat 2026-09-25): tüm ürünlerde tek marka "Takyon Ai".
import React from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { Card, Icon, ListRow, Screen, TakyonMark } from '../../ui';
import { tr } from '../../i18n';

const PUBLIC_WEB = 'https://app.takyon.ai';

function webUrl(path: string) {
  const origin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : PUBLIC_WEB;
  return `${origin}${path}`;
}

export function AboutScreen() {
  const t = useTheme();
  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: t.space[2], paddingVertical: t.space[6] }}>
        <TakyonMark size={t.size.avatarLg} />
        <Text style={[t.type.display28, { color: t.colors.ink }]}>Takyon Ai</Text>
        <Text style={[t.type.body14, { color: t.colors.ink2, textAlign: 'center' }]}>{tr('Kaliteli kumaş aramanın yenilikçi yolu')}</Text>
      </View>
      <Card noPadding>
        <ListRow
          title={tr('Gizlilik politikası')}
          left={<Icon name="shield-checkmark-outline" color="brand" />}
          onPress={() => Linking.openURL(webUrl('/gizlilik.html')).catch(() => undefined)}
          divider={false}
        />
      </Card>
      <View style={{ alignItems: 'center', gap: t.space[1], paddingVertical: t.space[6] }}>
        <Text style={[t.type.caption12, { color: t.colors.ink3 }]}>© {new Date().getFullYear()} Takyon Ai Sanayi ve Ticaret A.Ş.</Text>
      </View>
    </Screen>
  );
}
