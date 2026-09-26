# `src/ui` — ortak bileşenler

DESIGN.md §3'teki bileşenlerin tek kaynağı. **Kural:** bu klasörde ham hex ve ham px
yazılmaz; her renk `t.colors.*`, boşluk `t.space[n]`, köşe `t.radius.*`, ölçü `t.size.*`,
yazı `t.type.*` (`const t = useTheme()`). Renkler tema nesnesinden geldiği için
`StyleSheet.create` içinde renk/boşluk sabitlenmez, stiller bileşen içinde üretilir.
Böylece açık ve koyu tema kendiliğinden çalışır.

Hepsi `src/ui`den dışa aktarılır: `import { Button, Card } from '../../ui';`

Galeri: `src/screens/dev/UiGalleryScreen.tsx` (rota `UiGallery`, menüde yok).
Web'de adresin sonuna `?ui=1` eklenince açılır.

## Bileşenler

### `AppBar`
Üst bant, 56px, `surfaceBrand`. Güvenli alan boşluğunu kendi ekler.
```tsx
<AppBar title="Ürün detayı" leading="back" onBack={() => nav.goBack()}
  actions={[{ icon: 'bell', label: 'Bildirimler', onPress: open, dot: true }]} />
```
`leading`: `back` | `logo` | `none`. `left` ile tamamen özel sol node verilebilir.
`actions` en fazla 2 tanesi çizilir (44px ikon düğmeleri, `label` erişilebilirlik adıdır).

### `TabBar` / `TabBarFromNavigation`
64px, `surface1`, üst kenarlık `line`; ikon 24 + `caption12` etiket; aktif `brand`.
```tsx
<TabBar activeKey={key} onSelect={setKey}
  items={[{ key: 'home', label: 'Ana sayfa', icon: 'home', dot: true }]} />
```
react-navigation ile: `<Tab.Navigator tabBar={(p) => <TabBarFromNavigation {...p} />}>`.
Rota adı → ikon eşlemesi `routeIcons`; `icons` prop'uyla genişletilir. `tabBarBadge`
verilmiş sekmede bildirim noktası çıkar.

### `Button`
`kind`: `primary` (dolu, ekranda en fazla 1) · `secondary` (kenarlıklı) · `quiet`
(zeminsiz) · `danger`. `size`: `md` (48) | `lg` (52 + tam genişlik).
```tsx
<Button label="Numune talep et" icon="sample" onPress={send} />
<Button kind="secondary" label="Vazgeç" onPress={close} />
<Button size="lg" label="Kaydet" loading={saving} onPress={save} />
```
`disabled` opaklığı .4 yapar, `loading` içinde dönen simge gösterir ve basılamaz olur.

### `Input`
Etiket üstte, 48px alan, odakta 2px `focus` çerçeve (dışarıda, düzen kaymaz).
`forwardRef` ile `TextInput`e erişilir; `keyboardType`/`inputMode` doğrudan geçer.
```tsx
<Input label="Gramaj" unit="gr/m²" inputMode="decimal" keyboardType="decimal-pad"
  value={v} onChangeText={setV} error={hata} helper="Etiketten okunabilir." />
```
`error` verilince kenarlık `danger`, altında ikonlu hata metni çıkar (helper gizlenir).

### `Card`
`surface1`, 1px `line`, `radius.lg`, iç boşluk `space[4]`, gölge yok.
`onPress` verilirse tamamı basılabilir olur ve sağda chevron çıkar.
`noPadding` iç boşluğu kaldırır (bölümleri kendi boşluğunu taşıyan kartlar).

### `ProductCard`
72px görsel (yoksa `surface2` kare + kumaş ikonu), ad, kod (`mono14`), özellik satırı,
firma + `Badge verified`, sağda chevron.
```tsx
<ProductCard name="Süprem penye" code="MLD-R0096A"
  specs="165 gr/m² · 160 cm · %94 PES %6 EA"
  companyName="Melide Tekstil" companyVerified imageUri={foto} onPress={ac} />
```

### `ListRow` (+ `Avatar`, `initialsOf`)
64px satır, altında tam genişlik ayırıcı (`divider={false}` ile kapatılır).
Sol: `avatarName` + `avatarKind` (`person` yuvarlak / `company` `radius.sm`) ya da
özel `left` node. Sağ: `right` node | `time` | chevron (onPress varsa).
`unread` alt metni koyulaştırır, `unreadCount` `accent` sayaç pill'i çizer.
Not: `right` içine düğme konmaz (iç içe düğme olmaz).

### `Badge`
22px, BÜYÜK HARF `caption12`, her zaman ikon + metin.
`kind`: `verified` · `pending` · `delivered` · `cancelled` · `new` · `info` · `documented` · `collaboration`.
`label` ile metni değiştirebilirsiniz: `<Badge kind="info" label="Stokta" />`.

### `Chip` / `ChipRow`
36px pill. `selected` olunca `brand` zemin + `onBrand` metin. `ChipRow` yatay kaydırır,
satır kırmaz.
```tsx
<ChipRow>{list.map((c) => <Chip key={c} label={c} selected={c === sel} onPress={() => setSel(c)} />)}</ChipRow>
```

### `SegmentControl`
`surface2` zemin, 4px iç boşluk; öğe 36px; seçili `surface1` + 1px `line`.
`stretch` öğeleri eşit genişliğe gerer. `components/ThemeSwitch.tsx` bunu kullanır.

### `EmptyState`
48px kontur ikon, `title18` başlık (yapılacak işi söyler), tek cümle açıklama
(en çok 280px), altında `secondary` düğme.
```tsx
<EmptyState icon="requests" title="Henüz talebin yok"
  description="Bir ürün sayfasından numune iste." actionLabel="Katalogu aç" onAction={ac} />
```

### `BottomSheet`
`Modal` tabanlı, web'de de çalışır. Arka `overlay`, üst köşe `radius.lg`, tutamaç 36×4.
Arka plana dokunmak kapatır. İçerik kaydırılabilir.
```tsx
<BottomSheet visible={acik} onClose={kapat} title="Birim seç">…</BottomSheet>
```

### `Skeleton` / `SkeletonText` / `SkeletonRow`
`surface2` bloklar, `radius.sm`. `SkeletonText lines={3}` (son satır kısa),
`SkeletonRow` avatar + iki satır. Dönen simge yalnızca `Button loading` içinde.

### `Icon`
Kontur ikonlar (Ionicons outline), varsayılan 24px ve `ink` rengi.
`color` bir renk token'ı adıdır (`ink2`, `brand`, `danger`…); zorunlu hallerde
`colorValue` ile doğrudan değer verilir.
Eşlenmiş adlar: `home, catalog, requests, messages, calculator, bell, user, search,
back, chevron, filter, camera, share, heart, plus, check, x, sample, quote, message,
whatsapp, fabric, yarn, scale, machine, info, warning, clock`.
Listede olmayan bir ikon gerekirse doğrudan Ionicons adı yazılabilir
(`<Icon name="image-outline" />`); sık kullanılacaksa `iconMap`'e eklenir.

### `Screen`
Ekran iskeleti: `surface0` zemin, içerik `maxWidth 480` ortalanmış,
`paddingHorizontal space[4]`, altta `space[10]` boşluk, bölümler arası `space[6]`.
```tsx
<Screen sticky={<Button size="lg" label="Numune talep et" onPress={ac} />}>…</Screen>
```
`scroll={false}` kendi listesini kuran ekranlar için, `noPadding` tam genişlik listeler için.

### `SectionTitle`
`title18` + sağda isteğe bağlı bağlantı (`label14`, `brand`).
```tsx
<SectionTitle title="Sektörden" linkLabel="Tümünü gör" onLinkPress={ac} />
```

### `StatBox`
Sayı `display28` (`accent` ile bakır) + `body14` `ink2` etiket. Genelde 3 sütun:
`<View style={{ flexDirection: 'row', gap: t.space[3] }}>` içinde yan yana.

### `QuickAction`
80px kart, sol 40px ikon karesi (`brandSoft` zemin, `brand` ikon), metin `body16Strong`
iki satıra kırılabilir. Ana sayfada 2 sütun.

### `Logo`
`design/icon.svg`'nin küçük hali (react-native-svg). Varsayılan rengi `onBrand`,
bant içinde kullanılır.
