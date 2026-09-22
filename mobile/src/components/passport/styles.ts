import type { TextStyle, ViewStyle } from 'react-native';
import type { Theme } from '../../theme/tokens';

// Belge önizleme karesi (DESIGN.md'de adı olmayan ölçü; ürün kartı görseli
// `thumb` 72 ile aynı dilde, biraz küçük).
export const DOC_PHOTO_SIZE = 64;

// Pasaport satır editörlerinin ortak stilleri (kumaş ve iplik formunda birebir
// aynı). Renkler temadan geldiği için sabit StyleSheet yerine `useTheme()`
// çıktısından üretilen bir yardımcı: `const styles = passportStyles(t)`.
export function passportStyles(t: Theme) {
  const label: TextStyle = { ...t.type.label14, color: t.colors.ink2, marginBottom: t.space[1] };
  const labelHint: TextStyle = { ...t.type.body14, color: t.colors.ink2, marginBottom: t.space[2] };
  // Tekrarlanan satırlar (kompozisyon, sertifika): ui/Card ölçüleri.
  const rowCard: ViewStyle = {
    backgroundColor: t.colors.surface1,
    borderWidth: 1,
    borderColor: t.colors.line,
    borderRadius: t.radius.lg,
    paddingHorizontal: t.space[4],
    paddingTop: t.space[3],
    marginBottom: t.space[4],
  };
  const rowCardHead: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: t.space[2],
  };
  const rowCardTitle: TextStyle = { ...t.type.body16Strong, color: t.colors.ink };
  // Kaldır düğmesi 44px dokunma hedefi (DESIGN.md §6).
  const rowRemove: ViewStyle = {
    width: t.size.touchMin,
    height: t.size.touchMin,
    marginRight: -t.space[3],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radius.md,
  };
  const rowRemovePressed: ViewStyle = { backgroundColor: t.colors.surface2 };
  const addRow: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space[2],
    minHeight: t.size.control,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: t.colors.lineStrong,
    backgroundColor: t.colors.surface1,
    marginBottom: t.space[4],
  };
  const addRowPressed: ViewStyle = { backgroundColor: t.colors.surface2 };
  const addRowText: TextStyle = { ...t.type.button16, color: t.colors.brand };
  const totalText: TextStyle = { ...t.type.mono14, color: t.colors.ink2, marginTop: -t.space[2], marginBottom: t.space[4] };
  const totalWarning: TextStyle = { color: t.colors.warning };
  const docRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space[3], marginBottom: t.space[4] };
  const docPhoto: ViewStyle = {
    width: DOC_PHOTO_SIZE,
    height: DOC_PHOTO_SIZE,
    borderRadius: t.radius.sm,
    borderWidth: 1,
    borderColor: t.colors.line,
    backgroundColor: t.colors.surface2,
    overflow: 'hidden',
  };
  const docPhotoEmpty: ViewStyle = {
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
    borderColor: t.colors.lineStrong,
  };
  const docActions: ViewStyle = { flex: 1, flexDirection: 'row', gap: t.space[2], flexWrap: 'wrap' };
  const docLoading: ViewStyle = { alignItems: 'center', justifyContent: 'center' };
  // Belge PDF ise fotoğraf yerine "PDF" kutusu (tehlike tonu: kırmızı belge ikonu).
  const docPdf: ViewStyle = {
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space[1] / 2,
    borderColor: t.colors.danger,
    backgroundColor: t.colors.dangerSoft,
  };
  const docPdfText: TextStyle = { ...t.type.caption12, color: t.colors.danger };
  // Belge kaynağı seçimi ekran içinde açılan kutu (web'de Alert.alert yok).
  const docSourceBox: ViewStyle = {
    borderWidth: 1,
    borderColor: t.colors.line,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surface1,
    paddingHorizontal: t.space[4],
    marginBottom: t.space[4],
    marginTop: -t.space[2],
  };

  return {
    label,
    labelHint,
    rowCard,
    rowCardHead,
    rowCardTitle,
    rowRemove,
    rowRemovePressed,
    addRow,
    addRowPressed,
    addRowText,
    totalText,
    totalWarning,
    docRow,
    docPhoto,
    docPhotoEmpty,
    docActions,
    docLoading,
    docPdf,
    docPdfText,
    docSourceBox,
  };
}

export type PassportStyles = ReturnType<typeof passportStyles>;
