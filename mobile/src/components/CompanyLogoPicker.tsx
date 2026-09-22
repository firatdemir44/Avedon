import React, { useState } from 'react';
import { View, Text, Image } from 'react-native';
import { pickCompressedImage } from '../features/imagePicker';
import { useTheme } from '../theme/ThemeContext';
import { Button } from '../ui';

// Logo karesi (DESIGN.md'de adı olmayan ekran-içi ölçü).
const LOGO_SIZE = 96;

const DEFAULT_HINT =
  'Kare ya da kareye yakın bir logo en iyi sonucu verir. Logo akışta, ürünlerde ve firma sayfanızda görünür.';

interface Props {
  // Logo yokken gösterilen baş harf bu addan çıkar.
  companyName: string;
  // Ekranda görünen logo (mevcut logo ya da yeni seçilenin data URL'i).
  preview: string | null;
  // Yeni logo seçildiğinde data URL, "Logoyu kaldır"da null.
  onChange: (dataUrl: string | null) => void;
  // Seçim sırasında oluşan hata; seçim başlarken null ile temizlenir.
  onError: (message: string | null) => void;
  // Açıklama metni; null verilirse hiç yazılmaz.
  hint?: string | null;
}

// Logo seçme/kaldırma bloğu: hem "Firmayı düzenle" formunda hem adım adım
// kurulumun logo adımında aynı görünüm ve aynı sıkıştırma ayarları kullanılsın
// diye ortak bileşen. Logo karesi firma avatarı dilinde (brand-soft / brand,
// radius-sm); görsel varsa 1px line çerçeve.
export function CompanyLogoPicker({ companyName, preview, onChange, onError, hint = DEFAULT_HINT }: Props) {
  const t = useTheme();
  const [picking, setPicking] = useState(false);

  const pick = async () => {
    setPicking(true);
    onError(null);
    try {
      // Logo küçük görünür; 400 px genişlik her ekranda net durmaya yetiyor ve
      // dosyayı sunucunun kabul ettiği boyutun çok altında tutuyor.
      const picked = await pickCompressedImage(400, 0.8, true);
      if (!picked) return;
      onChange(picked.dataUrl);
    } catch (err) {
      onError(
        err instanceof Error && err.message === 'permission_denied'
          ? 'Galeriye erişim izni verilmedi.'
          : 'Fotoğraf işlenemedi, lütfen başka bir fotoğraf deneyin.'
      );
    } finally {
      setPicking(false);
    }
  };

  const initial = companyName.trim().charAt(0).toLocaleUpperCase('tr-TR') || '?';

  return (
    <View style={{ gap: t.space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[4] }}>
        {preview ? (
          <Image
            source={{ uri: preview }}
            resizeMode="contain"
            accessibilityLabel={`${companyName} logosu`}
            style={{
              width: LOGO_SIZE,
              height: LOGO_SIZE,
              borderRadius: t.radius.sm,
              backgroundColor: t.colors.surface1,
              borderWidth: 1,
              borderColor: t.colors.line,
            }}
          />
        ) : (
          <View
            style={{
              width: LOGO_SIZE,
              height: LOGO_SIZE,
              borderRadius: t.radius.sm,
              backgroundColor: t.colors.brandSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={[t.type.display28, { color: t.colors.brand }]}>{initial}</Text>
          </View>
        )}
        <View style={{ flex: 1, gap: t.space[2] }}>
          <Button
            kind="secondary"
            label={picking ? 'İşleniyor...' : preview ? 'Logoyu değiştir' : 'Logo seç'}
            loading={picking}
            onPress={pick}
          />
          {preview ? <Button kind="quiet" label="Logoyu kaldır" onPress={() => onChange(null)} /> : null}
        </View>
      </View>
      {hint ? <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{hint}</Text> : null}
    </View>
  );
}
