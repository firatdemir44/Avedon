import { StyleSheet } from 'react-native';
import { colors, fonts, radius, spacing, typography } from '../../theme';

export const DOC_PHOTO_SIZE = 64;

// Pasaport satır editörlerinin ortak stilleri (kumaş ve iplik formunda birebir
// aynıydı). Ekranların kendi kopyaları kaldırıldı.
export const rowStyles = StyleSheet.create({
  label: { ...typography.label, fontFamily: fonts.semibold, color: colors.text, marginBottom: spacing.xs },
  labelHint: { ...typography.caption, color: colors.textMuted, marginTop: -2, marginBottom: spacing.sm },
  // Tekrarlanan satırlar (kompozisyon, sertifika): ince çerçeveli kutu.
  rowCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 2,
    paddingTop: spacing.sm,
    marginBottom: spacing.md,
  },
  rowCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  rowCardTitle: { ...typography.label, fontFamily: fonts.semibold, color: colors.primary },
  rowRemove: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  rowRemovePressed: { backgroundColor: colors.pressed },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    marginBottom: spacing.md,
  },
  addRowPressed: { backgroundColor: colors.pressed },
  addRowText: { ...typography.label, color: colors.accent },
  totalText: { ...typography.label, color: colors.textMuted, marginTop: -spacing.sm, marginBottom: spacing.md },
  totalWarning: { color: colors.warning },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  docPhoto: { width: DOC_PHOTO_SIZE, height: DOC_PHOTO_SIZE, borderRadius: radius.md, backgroundColor: colors.surfaceTonal },
  docPhotoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  docActions: { flex: 1, flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  docLoading: { alignItems: 'center', justifyContent: 'center' },
});
