import React, { useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  type StyleProp,
  type TextStyle,
  type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TableInput } from './TableInput';
import { UnitToggle } from './UnitToggle';
import { confirmAction } from '../features/confirm';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../theme';

// "Hesap tablosu" kalıbı (kullanıcı isteği 2026-09-21: "hesaplama sistemini bir
// tabloya dönüştürelim, Örme Parkuru'ndaki tablo gibi"). Hesap artık alt alta
// etiketli kutular değil, TEK bir elektronik tablo: solda kalem adı, ortada
// girilen değer, sağda birim; en altta vurgulu SONUÇ satırları.
//
// 375 px KURALI: uygulama çoğunlukla telefonda WEB'de kullanılıyor. Web'de
// <input> öğesinin kendi asgari genişliği var; her giriş hücresinde `minWidth: 0`
// olmazsa esnek sütun daralmaz ve yan hücreleri ekran dışına iter
// (2026-09-21: "% kısmına rakam giremedim"). Değer ve birim hücreleri bu yüzden
// SABİT genişlikte, kalem adı esnek ve `minWidth: 0`.

const VALUE_WIDTH = 104;
const UNIT_WIDTH = 62;

interface TableProps {
  /** Üstteki lacivert başlık şeridi (tablo adı). */
  title?: string;
  children: React.ReactNode;
}

export function CalcTable({ title, children }: TableProps) {
  // Zebra: yalnızca giriş satırları sayılır, ara başlıkta sayaç sıfırlanır.
  let inputIndex = 0;
  let first = true;
  const rows = React.Children.toArray(children).map((child) => {
    if (!React.isValidElement(child)) return child;
    const isFirst = first;
    first = false;
    if (child.type === CalcSectionRow) {
      inputIndex = 0;
      return React.cloneElement(child as React.ReactElement<RowInternals>, { _first: isFirst });
    }
    if (child.type === CalcInputRow) {
      const odd = inputIndex % 2 === 1;
      inputIndex += 1;
      return React.cloneElement(child as React.ReactElement<RowInternals>, { _first: isFirst, _zebra: odd });
    }
    return React.cloneElement(child as React.ReactElement<RowInternals>, { _first: isFirst });
  });

  return (
    <View style={styles.table}>
      {title ? (
        <View style={styles.titleBar}>
          <Text style={styles.titleText} accessibilityRole="header">
            {title}
          </Text>
        </View>
      ) : null}
      {rows}
    </View>
  );
}

interface RowInternals {
  _first?: boolean;
  _zebra?: boolean;
}

// Tablo içinde ara başlık satırı: açık gri zemin, küçük büyük harf etiket.
export function CalcSectionRow({ label, _first }: { label: string } & RowInternals) {
  return (
    <View style={[styles.sectionRow, !_first && styles.divided]}>
      <Text style={styles.sectionText}>{label.toLocaleUpperCase('tr-TR')}</Text>
    </View>
  );
}

interface InputRowProps extends RowInternals {
  label: string;
  /** Kalem adının altındaki küçük gri açıklama. */
  hint?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  /** Sabit birim metni (örn. "%", "₺/kg"). */
  unit?: string;
  /** Birim yerine dokunmalı seçici (para birimi, numara sistemi). */
  unitToggle?: { options: { value: string; label: string }[]; value: string; onChange: (value: string) => void };
  keyboardType?: TextInputProps['keyboardType'];
  /** Satırın altında kırmızı küçük uyarı. */
  error?: string;
}

// [kalem adı (esnek)] [değer (sabit)] [birim (sabit)]
export function CalcInputRow({
  label,
  hint,
  value,
  onChangeText,
  placeholder,
  unit,
  unitToggle,
  keyboardType = 'decimal-pad',
  error,
  _first,
  _zebra,
}: InputRowProps) {
  const inputRef = useRef<TextInput>(null);
  const unitLabel = unit ?? (unitToggle ? unitToggle.options.find((o) => o.value === unitToggle.value)?.label : '');
  const a11y = `${label}${unitLabel ? `, ${unitLabel}` : ''}`;

  return (
    <View style={[!_first && styles.divided, _zebra && styles.zebra]}>
      {/* Satırın herhangi bir yerine (kalem adına da) dokununca giriş odaklanır.
          TextInput düğme değildir; iç içe buton sorunu oluşmaz. */}
      <Pressable
        onPress={() => inputRef.current?.focus()}
        accessibilityLabel={`${a11y} alanına yaz`}
        style={styles.inputRow}
      >
        <View style={styles.labelCell}>
          <Text style={styles.labelText} numberOfLines={2}>
            {label}
          </Text>
          {hint ? (
            <Text style={styles.hintText} numberOfLines={2}>
              {hint}
            </Text>
          ) : null}
        </View>
        <View style={styles.valueCell}>
          <TableInput
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            keyboardType={keyboardType}
            accessibilityLabel={a11y}
            style={[styles.valueInput, !!error && styles.valueInputError]}
          />
        </View>
        <View style={styles.unitCell}>
          {unitToggle ? (
            <UnitToggle
              options={unitToggle.options}
              value={unitToggle.value}
              onChange={unitToggle.onChange}
              label={`${label} birimi`}
            />
          ) : unit ? (
            <Text style={styles.unitText} numberOfLines={2}>
              {unit}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

interface ResultRowProps extends RowInternals {
  label: string;
  /** Hesaplanamıyorsa "—" gönderilir. */
  value: string;
  unit?: string;
  /** Etiketin altındaki küçük açıklama (örn. toplam içindeki pay). */
  note?: string;
  emphasis?: 'primary';
}

export function CalcResultRow({ label, value, unit, note, emphasis, _first }: ResultRowProps) {
  return (
    <View
      style={[styles.resultRow, !_first && styles.divided, emphasis === 'primary' && styles.resultRowPrimary]}
      accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}`}
    >
      <View style={styles.resultLabelCell}>
        <Text style={[styles.resultLabel, emphasis === 'primary' && styles.resultLabelPrimary]} numberOfLines={2}>
          {label}
        </Text>
        {note ? (
          <Text style={[styles.hintText, emphasis === 'primary' && styles.onPrimaryMuted]}>{note}</Text>
        ) : null}
      </View>
      <Text style={[styles.resultValue, emphasis === 'primary' && styles.resultValuePrimary]}>{value}</Text>
      {unit ? (
        <Text style={[styles.resultUnit, emphasis === 'primary' && styles.onPrimaryMuted]}>{unit}</Text>
      ) : null}
    </View>
  );
}

// Tablonun altındaki açıklama/uyarı satırı.
export function CalcNoteRow({
  text,
  tone = 'muted',
  _first,
}: { text: string; tone?: 'muted' | 'warning' } & RowInternals) {
  return (
    <View style={[styles.noteRow, !_first && styles.divided, tone === 'warning' && styles.noteRowWarning]}>
      {tone === 'warning' ? <Ionicons name="alert-circle-outline" size={16} color={colors.danger} /> : null}
      <Text style={[styles.noteText, tone === 'warning' && styles.noteTextWarning]}>{text}</Text>
    </View>
  );
}

// Tablo altında katlanabilir "Nasıl hesaplandı?" satırı.
export function CalcFormulaRow({ text, _first }: { text: string } & RowInternals) {
  const [open, setOpen] = React.useState(false);
  return (
    <View style={[!_first && styles.divided]}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Nasıl hesaplandı, ${open ? 'kapat' : 'aç'}`}
        style={({ pressed }) => [styles.formulaToggle, pressed && styles.pressedRow]}
      >
        <Text style={styles.formulaToggleText}>Nasıl hesaplandı?</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.chevron} />
      </Pressable>
      {open ? <Text style={styles.formulaText}>{text}</Text> : null}
    </View>
  );
}

// ——— Tablo içindeki alt tablo (çok satırlı iplik girişleri) ———

export function CalcSubRow({
  children,
  header,
  _first,
}: { children: React.ReactNode; header?: boolean } & RowInternals) {
  return <View style={[styles.subRow, header && styles.subHead, !_first && styles.divided]}>{children}</View>;
}

export function CalcSubHeadCell({ label, style }: { label: string; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[styles.subHeadText, style]} numberOfLines={2}>
      {label}
    </Text>
  );
}

export function CalcAddRow({ label, onPress, _first }: { label: string; onPress: () => void } & RowInternals) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.addRow, !_first && styles.divided, pressed && styles.pressedRow]}
    >
      <Ionicons name="add" size={18} color={colors.accent} />
      <Text style={styles.addText}>{label}</Text>
    </Pressable>
  );
}

export function CalcRemoveCell({ label, onPress }: { label: string; onPress?: () => void }) {
  if (!onPress) return <View style={styles.removeCell} />;
  return (
    <Pressable style={styles.removeCell} onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name="close" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

// Tablo altındaki ikincil eylem: tüm alanları (cihazda hatırlananlar dahil)
// boşaltır. Geri alınamaz olduğu için önce onay sorar (web'de Alert yok,
// `confirmAction` tarayıcının kendi kutusunu kullanır).
export function CalcClearButton({ onClear }: { onClear: () => void }) {
  const press = async () => {
    const ok = await confirmAction({
      title: 'Alanları temizle',
      message: 'Girdiğiniz bütün değerler silinecek. Devam edilsin mi?',
      confirmLabel: 'Temizle',
      destructive: true,
    });
    if (ok) onClear();
  };
  return (
    <Pressable
      onPress={press}
      accessibilityRole="button"
      accessibilityLabel="Alanları temizle"
      style={({ pressed }) => [styles.clearButton, pressed && styles.pressedRow]}
    >
      <Ionicons name="refresh-outline" size={16} color={colors.textMuted} />
      <Text style={styles.clearText}>Temizle</Text>
    </Pressable>
  );
}

export const calcCells = StyleSheet.create({
  index: { width: 16, ...typography.label, color: colors.primary, textAlign: 'center' },
  // Alt tablo sütunları: hepsi minWidth 0 (web'de <input> daralabilsin).
  flex1: { flex: 1, minWidth: 0 },
  flex11: { flex: 1.1, minWidth: 0 },
  flex2: { flex: 2, minWidth: 0 },
});

const styles = StyleSheet.create({
  table: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  titleBar: { backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 8 },
  titleText: { ...typography.label, fontFamily: fonts.semibold, color: colors.primaryText },
  divided: { borderTopWidth: 1, borderTopColor: colors.divider },
  zebra: { backgroundColor: colors.surfaceTonal },
  pressedRow: { backgroundColor: colors.pressed },

  sectionRow: { backgroundColor: colors.chip, paddingHorizontal: 10, paddingVertical: 6 },
  sectionText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.5,
    color: colors.textMuted,
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: MIN_TOUCH,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  labelCell: { flex: 1, minWidth: 0 },
  labelText: { ...typography.caption, fontSize: 14, lineHeight: 18, color: colors.text },
  hintText: { ...typography.caption, fontSize: 11, lineHeight: 15, color: colors.textMuted },
  valueCell: { width: VALUE_WIDTH, minWidth: 0 },
  valueInput: { width: '100%', fontSize: 16 },
  valueInputError: { borderColor: colors.danger },
  unitCell: { width: UNIT_WIDTH, minWidth: 0, alignItems: 'flex-start', justifyContent: 'center' },
  unitText: { ...typography.caption, fontSize: 13, color: colors.textMuted },
  errorText: {
    ...typography.caption,
    fontSize: 12,
    color: colors.danger,
    paddingHorizontal: 10,
    paddingBottom: 6,
  },

  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: MIN_TOUCH,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.accentSoft,
  },
  resultRowPrimary: { backgroundColor: colors.primary },
  resultLabelCell: { flex: 1, minWidth: 0 },
  resultLabel: { ...typography.caption, fontSize: 14, lineHeight: 19, fontFamily: fonts.semibold, color: colors.text },
  resultLabelPrimary: { color: colors.primaryText },
  // Lacivert sonuç satırındaki ikincil metinler (birim, döviz karşılığı).
  onPrimaryMuted: { color: colors.onPrimaryMuted },
  resultValue: { fontFamily: fonts.monoSemibold, fontSize: 17, lineHeight: 23, color: colors.primary, textAlign: 'right' },
  resultValuePrimary: { color: colors.primaryText, fontSize: 19, lineHeight: 25 },
  resultUnit: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 23, color: colors.textMuted, maxWidth: 58 },

  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  noteRowWarning: { backgroundColor: colors.dangerSoft },
  noteText: { ...typography.caption, fontSize: 12, lineHeight: 17, color: colors.textMuted, flex: 1, minWidth: 0 },
  noteTextWarning: { color: colors.danger },

  formulaToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: MIN_TOUCH, paddingHorizontal: 10 },
  formulaToggleText: { ...typography.caption, fontSize: 12, color: colors.textMuted },
  formulaText: {
    ...typography.caption,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
    paddingHorizontal: 10,
    paddingBottom: spacing.sm,
  },

  subRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5 },
  subHead: { backgroundColor: colors.surfaceTonal, paddingVertical: 4 },
  subHeadText: {
    ...typography.caption,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fonts.semibold,
    color: colors.textMuted,
    textAlign: 'center',
  },

  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: MIN_TOUCH,
  },
  addText: { ...typography.label, color: colors.accent },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  clearText: { ...typography.label, color: colors.textMuted },
  removeCell: { width: 24, alignItems: 'center', justifyContent: 'center', minHeight: MIN_TOUCH - 8 },
});
