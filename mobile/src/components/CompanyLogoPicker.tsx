import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { PrimaryButton } from './PrimaryButton';
import { pickCompressedImage } from '../features/imagePicker';
import { colors, fonts, radius, spacing, typography } from '../theme';

const LOGO_SIZE = 96;

const DEFAULT_HINT =
  'Kare ya da kareye yakın bir logo en iyi sonucu verir. Logo akışta, ürünlerde ve firma sayfanızda görünür.';

interface Props {
  // Logo yokken gösterilen baş harf bu addan çıkar.
  companyName: string;
  // Ekranda görünen logo (mevcut logo ya da yeni seçilenin data URL'i).
  preview: string | null;
  // Yeni logo seçildiğinde data URL, "Logoyu Kaldır"da null.
  onChange: (dataUrl: string | null) => void;
  // Seçim sırasında oluşan hata; seçim başlarken null ile temizlenir.
  onError: (message: string | null) => void;
  // Açıklama metni; null verilirse hiç yazılmaz.
  hint?: string | null;
}

// Logo seçme/kaldırma bloğu: hem "Firmayı Düzenle" formunda hem adım adım
// kurulumun logo adımında aynı görünüm ve aynı sıkıştırma ayarları kullanılsın
// diye ortak bileşen.
export function CompanyLogoPicker({ companyName, preview, onChange, onError, hint = DEFAULT_HINT }: Props) {
  const [picking, setPicking] = useState(false);

  const pick = async () => {
    setPicking(true);
    onError(null);
    try {
      // Logo küçük görünür; 400 px genişlik her ekranda net durmaya yetiyor ve
      // dosyayı sunucunun kabul ettiği boyutun çok altında tutuyor.
      const picked = await pickCompressedImage(400, 0.8);
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
    <View>
      <View style={styles.logoRow}>
        {preview ? (
          <Image source={{ uri: preview }} style={[styles.logo, styles.logoImage]} resizeMode="cover" />
        ) : (
          <View style={styles.logo}>
            <Text style={styles.logoInitial}>{initial}</Text>
          </View>
        )}
        <View style={styles.logoActions}>
          <PrimaryButton
            label={picking ? 'İşleniyor...' : preview ? 'Logoyu Değiştir' : 'Logo Seç'}
            variant="secondary"
            disabled={picking}
            onPress={pick}
          />
          {preview ? <PrimaryButton label="Logoyu Kaldır" variant="secondary" onPress={() => onChange(null)} /> : null}
        </View>
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  logoInitial: { fontSize: 40, fontFamily: fonts.bold, color: colors.primaryText },
  logoActions: { flex: 1, gap: spacing.sm },
  hint: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.md },
});
