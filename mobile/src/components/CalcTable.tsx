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
import { TableInput } from './TableInput';
import { UnitToggle } from './UnitToggle';
import { confirmAction } from '../features/confirm';
import { useTheme } from '../theme/ThemeContext';
import { space } from '../theme/tokens';
import { Button, Icon } from '../ui';

// "Hesap tablosu" kalıbı (kullanıcı isteği 2026-09-21: "hesaplama sistemini bir
// tabloya dönüştürelim, Örme Parkuru'ndaki tablo gibi"). Hesap artık alt alta
// etiketli kutular değil, TEK bir elektronik tablo: solda kalem adı, ortada
// girilen değer, sağda birim; en altta vurgulu SONUÇ satırları.
//
// 2026-09-22 (yeni tasarım, 4. adım): tablo düzeni AYNEN kaldı; yalnızca renk,
// yazı, köşe ve boşluklar DESIGN.md token'larına bağlandı. Ham hex / ham px yok:
// renkler tema nesnesinden geldiği için stiller bileşen gövdesinde üretilir.
//
// 375 px KURALI: uygulama çoğunlukla telefonda WEB'de kullanılıyor. Web'de
// <input> öğesinin kendi asgari genişliği var; her giriş hücresinde `minWidth: 0`
// olmazsa esnek sütun daralmaz ve yan hücreleri ekran dışına iter
// (2026-09-21: "% kısmına rakam giremedim"). Değer ve birim hücreleri bu yüzden
// SABİT genişlikte, kalem adı esnek ve `minWidth: 0`.

const VALUE_WIDTH = 104;
const UNIT_WIDTH = 62;

interface TableProps {
  /** Üstteki marka rengi başlık şeridi (tablo adı). */
  title?: string;
  children: React.ReactNode;
}

export function CalcTable({ title, children }: TableProps) {
  const t = useTheme();

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
    <View
      style={{
        backgroundColor: t.colors.surface1,
        borderWidth: 1,
        borderColor: t.colors.line,
        borderRadius: t.radius.lg,
        overflow: 'hidden',
      }}
    >
      {title ? (
        <View
          style={{
            backgroundColor: t.colors.surfaceBrand,
            paddingHorizontal: t.space[3],
            paddingVertical: t.space[2],
          }}
        >
          <Text style={[t.type.label14, { color: t.colors.onBrand }]} accessibilityRole="header">
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

/** Satırlar arasındaki ince ayırıcı (ilk satırda çizilmez). */
function useDivider(first?: boolean) {
  const t = useTheme();
  return first ? null : { borderTopWidth: 1, borderTopColor: t.colors.line };
}

// Tablo içinde ara başlık satırı: `surface2` zemin, küçük BÜYÜK HARF etiket.
export function CalcSectionRow({ label, _first }: { label: string } & RowInternals) {
  const t = useTheme();
  const divider = useDivider(_first);
  return (
    <View
      style={[
        {
          backgroundColor: t.colors.surface2,
          paddingHorizontal: t.space[3],
          paddingVertical: t.space[2],
        },
        divider,
      ]}
    >
      <Text style={[t.type.caption12, { color: t.colors.ink2 }]}>{label.toLocaleUpperCase('tr-TR')}</Text>
    </View>
  );
}

interface InputRowProps extends RowInternals {
  label: string;
  /** Kalem adının altındaki küçük açıklama. */
  hint?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  /** Sabit birim metni (örn. "%", "₺/kg"). */
  unit?: string;
  /** Birim yerine dokunmalı seçici (para birimi, numara sistemi). */
  unitToggle?: { options: { value: string; label: string }[]; value: string; onChange: (value: string) => void };
  keyboardType?: TextInputProps['keyboardType'];
  /** Satırın altında küçük hata metni. */
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
  const t = useTheme();
  const divider = useDivider(_first);
  const inputRef = useRef<TextInput>(null);
  const unitLabel = unit ?? (unitToggle ? unitToggle.options.find((o) => o.value === unitToggle.value)?.label : '');
  const a11y = `${label}${unitLabel ? `, ${unitLabel}` : ''}`;

  return (
    <View style={[divider, _zebra && { backgroundColor: t.colors.surface2 }]}>
      {/* Satırın herhangi bir yerine (kalem adına da) dokununca giriş odaklanır.
          TextInput düğme değildir; iç içe buton sorunu oluşmaz. */}
      <Pressable
        onPress={() => inputRef.current?.focus()}
        accessibilityLabel={`${a11y} alanına yaz`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[2],
          minHeight: t.size.touchMin,
          paddingHorizontal: t.space[3],
          paddingVertical: t.space[2],
        }}
      >
        <View style={styles.flexCell}>
          <Text style={[t.type.body14, { color: t.colors.ink }]} numberOfLines={2}>
            {label}
          </Text>
          {hint ? (
            <Text style={[t.type.caption12, { color: t.colors.ink3 }]} numberOfLines={2}>
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
            style={[styles.fullWidth, !!error && { borderColor: t.colors.danger }]}
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
            <Text style={[t.type.mono14, { color: t.colors.ink3 }]} numberOfLines={2}>
              {unit}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {error ? (
        <Text
          style={[
            t.type.body14,
            { color: t.colors.danger, paddingHorizontal: t.space[3], paddingBottom: t.space[2] },
          ]}
        >
          {error}
        </Text>
      ) : null}
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
  const t = useTheme();
  const divider = useDivider(_first);
  const primary = emphasis === 'primary';
  // Vurgulu satırda bütün metinler ters zeminde: `onBrand`.
  const labelColor = primary ? t.colors.onBrand : t.colors.ink;
  const mutedColor = primary ? t.colors.onBrand : t.colors.ink3;

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[2],
          minHeight: t.size.touchMin,
          paddingHorizontal: t.space[3],
          paddingVertical: t.space[2],
          backgroundColor: primary ? t.colors.surfaceBrand : t.colors.brandSoft,
        },
        divider,
      ]}
      accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}`}
    >
      <View style={styles.flexCell}>
        <Text style={[t.type.label14, { color: labelColor }]} numberOfLines={2}>
          {label}
        </Text>
        {note ? <Text style={[t.type.caption12, { color: mutedColor }]}>{note}</Text> : null}
      </View>
      <Text
        numberOfLines={1}
        style={[
          primary ? t.type.display28 : t.type.mono20,
          { color: primary ? t.colors.onBrand : t.colors.brand, textAlign: 'right', flexShrink: 1 },
        ]}
      >
        {value}
      </Text>
      {unit ? <Text style={[t.type.mono14, { color: mutedColor }]}>{unit}</Text> : null}
    </View>
  );
}

// Tablonun altındaki açıklama/uyarı satırı.
export function CalcNoteRow({
  text,
  tone = 'muted',
  action,
  _first,
}: { text: string; tone?: 'muted' | 'warning'; action?: { label: string; onPress: () => void } } & RowInternals) {
  const t = useTheme();
  const divider = useDivider(_first);
  const warning = tone === 'warning';
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: t.space[2],
          paddingHorizontal: t.space[3],
          paddingVertical: t.space[2],
        },
        divider,
        warning && { backgroundColor: t.colors.dangerSoft },
      ]}
    >
      {warning ? <Icon name="warning" size={t.size.iconSm} color="danger" /> : null}
      <Text style={[t.type.body14, styles.flexCell, { color: warning ? t.colors.danger : t.colors.ink3 }]}>
        {text}
      </Text>
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="link"
          accessibilityLabel={action.label}
          hitSlop={t.space[2]}
        >
          <Text style={[t.type.label14, { color: t.colors.brand }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Tablo altında katlanabilir "Nasıl hesaplandı?" satırı.
export function CalcFormulaRow({ text, _first }: { text: string } & RowInternals) {
  const t = useTheme();
  const divider = useDivider(_first);
  const [open, setOpen] = React.useState(false);
  return (
    <View style={divider}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Nasıl hesaplandı, ${open ? 'kapat' : 'aç'}`}
        style={({ pressed }) => [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.space[1],
            minHeight: t.size.touchMin,
            paddingHorizontal: t.space[3],
          },
          pressed && { backgroundColor: t.colors.surface2 },
        ]}
      >
        <Text style={[t.type.body14, { color: t.colors.ink3 }]}>Nasıl hesaplandı?</Text>
        <Icon name={open ? 'chevron-up-outline' : 'chevron-down-outline'} size={t.size.iconSm} color="ink3" />
      </Pressable>
      {open ? (
        <Text
          style={[
            t.type.body14,
            { color: t.colors.ink3, paddingHorizontal: t.space[3], paddingBottom: t.space[3] },
          ]}
        >
          {text}
        </Text>
      ) : null}
    </View>
  );
}

// ——— Tablo içindeki alt tablo (çok satırlı iplik girişleri) ———

export function CalcSubRow({
  children,
  header,
  _first,
}: { children: React.ReactNode; header?: boolean } & RowInternals) {
  const t = useTheme();
  const divider = useDivider(_first);
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[2],
          paddingHorizontal: t.space[3],
          paddingVertical: t.space[1],
        },
        header && { backgroundColor: t.colors.surface2 },
        divider,
      ]}
    >
      {children}
    </View>
  );
}

export function CalcSubHeadCell({ label, style }: { label: string; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return (
    <Text style={[t.type.caption12, { color: t.colors.ink2, textAlign: 'center' }, style]} numberOfLines={2}>
      {label}
    </Text>
  );
}

export function CalcAddRow({ label, onPress, _first }: { label: string; onPress: () => void } & RowInternals) {
  const t = useTheme();
  const divider = useDivider(_first);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: t.space[1],
          minHeight: t.size.touchMin,
        },
        divider,
        pressed && { backgroundColor: t.colors.surface2 },
      ]}
    >
      <Icon name="plus" size={t.size.iconSm} color="brand" />
      <Text style={[t.type.label14, { color: t.colors.brand }]}>{label}</Text>
    </Pressable>
  );
}

export function CalcRemoveCell({ label, onPress }: { label: string; onPress?: () => void }) {
  const t = useTheme();
  const cell = {
    width: t.size.icon,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: t.size.touchMin,
  } as const;
  if (!onPress) return <View style={cell} />;
  return (
    <Pressable style={cell} onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}>
      <Icon name="x" size={t.size.iconSm} color="ink3" />
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
    <Button
      kind="secondary"
      label="Temizle"
      icon="refresh-outline"
      accessibilityLabel="Alanları temizle"
      onPress={press}
    />
  );
}

// Yalnızca yerleşim (renk/yazı taşımaz): alt tablo sütun genişlikleri.
// Hepsinde `minWidth: 0` — web'de <input> daralabilsin diye.
export const calcCells = StyleSheet.create({
  // Sıra numarası sütunu: 4px ızgaranın `space[4]` adımı (16).
  index: { width: space[4], textAlign: 'center' },
  flex1: { flex: 1, minWidth: 0 },
  flex11: { flex: 1.1, minWidth: 0 },
  flex2: { flex: 2, minWidth: 0 },
});

// Renk/boşluk taşımayan sabit yerleşim ölçüleri (375 px kuralı).
const styles = StyleSheet.create({
  flexCell: { flex: 1, minWidth: 0 },
  fullWidth: { width: '100%' },
  valueCell: { width: VALUE_WIDTH, minWidth: 0 },
  unitCell: { width: UNIT_WIDTH, minWidth: 0, alignItems: 'flex-start', justifyContent: 'center' },
});
