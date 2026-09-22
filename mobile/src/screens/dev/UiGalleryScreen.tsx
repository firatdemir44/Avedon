// Bileşen galerisi (yalnızca geliştirme): src/ui altındaki her bileşenin
// açık/koyu temada nasıl göründüğünü tek ekranda gösterir. Menüye konmaz;
// rota adı "UiGallery" (navigation/types.ts).
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { ThemeSwitch } from '../../components/ThemeSwitch';
import {
  AppBar,
  Badge,
  BottomSheet,
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  Icon,
  iconMap,
  Input,
  ListRow,
  ProductCard,
  QuickAction,
  Screen,
  SectionTitle,
  SegmentControl,
  Skeleton,
  SkeletonRow,
  SkeletonText,
  StatBox,
  TabBar,
  type IconName,
} from '../../ui';
import type { RootStackScreenProps } from '../../navigation/types';

export function UiGalleryScreen({ navigation }: RootStackScreenProps<'UiGallery'>) {
  const t = useTheme();
  const [chip, setChip] = useState('hepsi');
  const [segment, setSegment] = useState<'kumas' | 'iplik'>('kumas');
  const [tab, setTab] = useState('home');
  const [text, setText] = useState('');
  const [sheet, setSheet] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      <AppBar
        title="Bileşen galerisi"
        leading="back"
        onBack={() => navigation.goBack()}
        actions={[
          { icon: 'search', label: 'Ara', onPress: () => undefined },
          { icon: 'bell', label: 'Bildirimler', onPress: () => undefined, dot: true },
        ]}
      />
      <Screen sticky={<Button size="lg" label="Numune talep et" icon="sample" onPress={() => setSheet(true)} />}>
        <View style={{ gap: t.space[3] }}>
          <SectionTitle title="Tema" />
          <ThemeSwitch />
        </View>

        <View style={{ gap: t.space[3] }}>
          <SectionTitle title="Üst bant" linkLabel="Tümünü gör" onLinkPress={() => undefined} />
          <AppBar title="Logolu bant" leading="logo" actions={[{ icon: 'filter', label: 'Süz', onPress: () => undefined }]} />
        </View>

        <View style={{ gap: t.space[3] }}>
          <SectionTitle title="Düğmeler" />
          <Button label="Birincil" icon="plus" onPress={() => undefined} />
          <Button kind="secondary" label="Kenarlıklı" onPress={() => undefined} />
          <Button kind="quiet" label="Sessiz" onPress={() => undefined} />
          <Button kind="danger" label="Sil" icon="x" onPress={() => undefined} />
          <Button label="Pasif" disabled onPress={() => undefined} />
          <Button label="Yükleniyor" loading onPress={() => undefined} />
          <Button size="lg" label="Tam genişlik (lg)" onPress={() => undefined} />
        </View>

        <View style={{ gap: t.space[3] }}>
          <SectionTitle title="Giriş alanları" />
          <Input label="Ürün adı" placeholder="Süprem" value={text} onChangeText={setText} />
          <Input label="Gramaj" placeholder="165" unit="gr/m²" inputMode="decimal" keyboardType="decimal-pad" />
          <Input label="En" defaultValue="abc" error="Sayı yazın." unit="cm" />
          <Input label="Not" helper="En fazla 200 karakter." multiline />
        </View>

        <View style={{ gap: t.space[3] }}>
          <SectionTitle title="Rozetler" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>
            <Badge kind="verified" />
            <Badge kind="pending" />
            <Badge kind="delivered" />
            <Badge kind="cancelled" />
            <Badge kind="new" />
            <Badge kind="info" />
          </View>
        </View>

        <View style={{ gap: t.space[3] }}>
          <SectionTitle title="Çipler" />
          <ChipRow>
            {['hepsi', 'örme', 'dokuma', 'iplik', 'fason'].map((c) => (
              <Chip key={c} label={c} selected={chip === c} onPress={() => setChip(c)} />
            ))}
          </ChipRow>
          <SegmentControl
            stretch
            accessibilityLabel="Tür"
            options={[
              { value: 'kumas', label: 'Kumaş' },
              { value: 'iplik', label: 'İplik' },
            ]}
            value={segment}
            onChange={setSegment}
          />
        </View>

        <View style={{ gap: t.space[3] }}>
          <SectionTitle title="Kartlar" />
          <Card>
            <Text style={[t.type.body16, { color: t.colors.ink }]}>Düz kart: surface-1, 1px line, radius-lg.</Text>
          </Card>
          <Card onPress={() => undefined} accessibilityLabel="Tıklanabilir kart">
            <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>Tıklanabilir kart</Text>
            <Text style={[t.type.body14, { color: t.colors.ink2 }]}>Sağda chevron çıkar.</Text>
          </Card>
          <ProductCard
            name="Süprem penye kumaş"
            code="MLD-R0096A"
            specs="165 gr/m² · 160 cm · %94 PES %6 EA"
            companyName="Melide Tekstil"
            companyVerified
            onPress={() => undefined}
          />
        </View>

        <View style={{ gap: t.space[3] }}>
          <SectionTitle title="Kısayollar ve sayılar" />
          <View style={{ flexDirection: 'row', gap: t.space[3] }}>
            <QuickAction style={{ flex: 1 }} label="Numune talep et" icon="sample" onPress={() => undefined} />
            <QuickAction style={{ flex: 1 }} label="Teklif topla" icon="quote" onPress={() => undefined} />
          </View>
          <View style={{ flexDirection: 'row', gap: t.space[3] }}>
            <StatBox value="128" label="Ürün" />
            <StatBox value="7" label="Yeni talep" accent />
            <StatBox value="3" label="Teklif" />
          </View>
        </View>

        <View style={{ gap: t.space[3] }}>
          <SectionTitle title="Liste satırları" />
          <Card noPadding style={{ paddingHorizontal: t.space[4] }}>
            <ListRow avatarName="Ahmet Yılmaz" title="Ahmet Yılmaz" subtitle="Numuneyi gönderdik." time="14:20" onPress={() => undefined} />
            <ListRow
              avatarName="Melide Tekstil"
              avatarKind="company"
              title="Melide Tekstil"
              subtitle="Yeni fiyat listesi hazır."
              unread
              unreadCount={3}
              onPress={() => undefined}
            />
            <ListRow
              left={<Icon name="machine" color="brand" />}
              title="Makine parkı"
              subtitle="12 makine"
              right={<Badge kind="pending" />}
              divider={false}
              onPress={() => undefined}
            />
          </Card>
        </View>

        <View style={{ gap: t.space[3] }}>
          <SectionTitle title="Sekme çubuğu" />
          <TabBar
            activeKey={tab}
            onSelect={setTab}
            items={[
              { key: 'home', label: 'Ana sayfa', icon: 'home' },
              { key: 'catalog', label: 'Katalog', icon: 'catalog' },
              { key: 'requests', label: 'Talepler', icon: 'requests', dot: true },
              { key: 'messages', label: 'Mesajlar', icon: 'messages' },
              { key: 'account', label: 'Hesap', icon: 'user' },
            ]}
          />
        </View>

        <View style={{ gap: t.space[3] }}>
          <SectionTitle title="Yükleme" />
          <Card>
            <SkeletonRow />
          </Card>
          <SkeletonText lines={3} />
          <Skeleton height={t.size.thumb} />
        </View>

        <View style={{ gap: t.space[3] }}>
          <SectionTitle title="Boş durum" />
          <Card>
            <EmptyState
              icon="requests"
              title="Henüz talebin yok"
              description="Bir ürünün sayfasından numune isteyince talepler burada görünür."
              actionLabel="Katalogu aç"
              onAction={() => undefined}
            />
          </Card>
        </View>

        <View style={{ gap: t.space[3] }}>
          <SectionTitle title="İkonlar" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[4] }}>
            {(Object.keys(iconMap) as IconName[]).map((n) => (
              <View key={n} style={{ alignItems: 'center', gap: t.space[1], width: t.size.quickAction }}>
                <Icon name={n} color="ink2" />
                <Text numberOfLines={1} style={[t.type.caption12, { color: t.colors.ink3 }]}>
                  {n}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </Screen>

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="Alt sayfa">
        <Text style={[t.type.body16, { color: t.colors.ink }]}>
          Alt sayfa: surface-1, üst köşe radius-lg, arka overlay, üstte tutamaç.
        </Text>
        <Button size="lg" label="Kapat" onPress={() => setSheet(false)} />
      </BottomSheet>
    </View>
  );
}
