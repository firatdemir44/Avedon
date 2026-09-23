// Makine parkı tablosu (DESIGN.md §3 "Makine tablosu"): firmanın kendi Excel
// tablosu gibi, makine başına bir satır. Dar ekranda No sütunu solda, Durum
// sütunu sağda sabit; aradaki sütunlar birlikte yatay kaydırılır. Başlık satırı
// tablonun kendi dikey kaydırmasında üstte sabit kalır.
// Toplu aktarım önizlemesi de aynı tabloyu kullanır (Durum yerine "Kayıt").
import React, { useRef } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import type { AvailabilityTone } from '../features/machines/availability';
import { useTheme } from '../theme/ThemeContext';

export interface MachineTableRow {
  key: string;
  no: string;
  pus: string;
  fine: string;
  brand: string;
  needles: string;
  feeders: string;
  fabric: string;
  /** Son sütun: renk noktası (varsa) + kısa metin. */
  status: { tone: AvailabilityTone | null; label: string };
  /** Ekran okuyucu için satır özeti. */
  a11y: string;
}

type ColKey = 'pus' | 'fine' | 'brand' | 'needles' | 'feeders' | 'fabric';
type ColWidth = 'tableColShort' | 'tableColMid' | 'tableColWide';

const COLUMNS: { key: ColKey; label: string; width: ColWidth; mono: boolean }[] = [
  { key: 'pus', label: 'Pus', width: 'tableColShort', mono: true },
  { key: 'fine', label: 'Fine', width: 'tableColShort', mono: true },
  { key: 'brand', label: 'Marka', width: 'tableColMid', mono: false },
  { key: 'needles', label: 'İğne', width: 'tableColMid', mono: true },
  { key: 'feeders', label: 'Sistem', width: 'tableColShort', mono: true },
  { key: 'fabric', label: 'Örgü cinsi', width: 'tableColWide', mono: false },
];

export function MachineTable({
  rows,
  statusHeader = 'Durum',
  onRowPress,
  onStatusPress,
  rowActionLabel,
  statusActionLabel,
}: {
  rows: MachineTableRow[];
  statusHeader?: string;
  onRowPress?: (key: string) => void;
  onStatusPress?: (key: string) => void;
  /** Satıra dokunmanın ne yaptığı (ekran okuyucu): "düzenle". */
  rowActionLabel?: string;
  statusActionLabel?: string;
}) {
  const t = useTheme();
  const { height } = useWindowDimensions();
  const headerScroll = useRef<ScrollView>(null);

  // Gövde yatay kayınca başlık da aynı yere kayar (başlık kendisi kaydırılmaz).
  const syncHeader = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    headerScroll.current?.scrollTo({ x: e.nativeEvent.contentOffset.x, animated: false });
  };

  const rowHeight = t.size.tableRow;
  const divider = { borderBottomWidth: 1, borderBottomColor: t.colors.line };
  const cell = { height: rowHeight, justifyContent: 'center' as const, paddingHorizontal: t.space[2] };
  const headText = [t.type.label14, { color: t.colors.ink2 }];

  const headerRow = (
    <View style={{ flexDirection: 'row', backgroundColor: t.colors.surface2, ...divider }}>
      <View style={[cell, { width: t.size.tableColNo, borderRightWidth: 1, borderRightColor: t.colors.line }]}>
        <Text style={headText}>No</Text>
      </View>
      <ScrollView ref={headerScroll} horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
        {COLUMNS.map((c) => (
          <View key={c.key} style={[cell, { width: t.size[c.width] }]}>
            <Text style={headText} numberOfLines={1}>
              {c.label}
            </Text>
          </View>
        ))}
      </ScrollView>
      <View style={[cell, { width: t.size.tableColStatus, borderLeftWidth: 1, borderLeftColor: t.colors.line }]}>
        <Text style={headText} numberOfLines={1}>
          {statusHeader}
        </Text>
      </View>
    </View>
  );

  const pressStyle = (pressed: boolean) => ({ backgroundColor: pressed ? t.colors.surface2 : undefined });

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: t.colors.line,
        borderRadius: t.radius.lg,
        backgroundColor: t.colors.surface1,
        overflow: 'hidden',
      }}
    >
      {headerRow}
      <ScrollView nestedScrollEnabled style={{ maxHeight: Math.round(height * 0.7) }}>
        <View style={{ flexDirection: 'row' }}>
          {/* Sabit No sütunu */}
          <View style={{ width: t.size.tableColNo, borderRightWidth: 1, borderRightColor: t.colors.line }}>
            {rows.map((row, i) => (
              <Pressable
                key={row.key}
                disabled={!onRowPress}
                onPress={() => onRowPress?.(row.key)}
                importantForAccessibility="no"
                accessibilityElementsHidden
                style={({ pressed }) => [cell, i < rows.length - 1 ? divider : null, pressStyle(pressed)]}
              >
                <Text style={[t.type.mono14, { color: t.colors.ink }]} numberOfLines={1}>
                  {row.no || '–'}
                </Text>
              </Pressable>
            ))}
          </View>
          {/* Kayan orta sütunlar */}
          <ScrollView horizontal nestedScrollEnabled onScroll={syncHeader} scrollEventThrottle={16} style={{ flex: 1 }}>
            <View>
              {rows.map((row, i) => (
                <Pressable
                  key={row.key}
                  disabled={!onRowPress}
                  onPress={() => onRowPress?.(row.key)}
                  accessibilityRole={onRowPress ? 'button' : undefined}
                  accessibilityLabel={rowActionLabel ? `${row.a11y}. ${rowActionLabel}` : row.a11y}
                  // Satır yüksekliği yan sütunlarla birebir (çizgi dahil); yoksa satırlar aşağı doğru kayıyordu.
                  style={({ pressed }) => [{ flexDirection: 'row', height: rowHeight }, i < rows.length - 1 ? divider : null, pressStyle(pressed)]}
                >
                  {COLUMNS.map((c) => (
                    <View key={c.key} style={[cell, { width: t.size[c.width], height: '100%' }]}>
                      <Text
                        style={[c.mono ? t.type.mono14 : t.type.body14, { color: row[c.key] ? t.colors.ink : t.colors.ink3 }]}
                        numberOfLines={1}
                      >
                        {row[c.key] || '–'}
                      </Text>
                    </View>
                  ))}
                </Pressable>
              ))}
            </View>
          </ScrollView>
          {/* Sabit Durum sütunu */}
          <View style={{ width: t.size.tableColStatus, borderLeftWidth: 1, borderLeftColor: t.colors.line }}>
            {rows.map((row, i) => {
              const handler = onStatusPress ?? onRowPress;
              return (
                <Pressable
                  key={row.key}
                  disabled={!handler}
                  onPress={() => handler?.(row.key)}
                  accessibilityRole={handler ? 'button' : undefined}
                  accessibilityLabel={`${row.no ? `${row.no} numara, ` : ''}${row.status.label}${onStatusPress && statusActionLabel ? `. ${statusActionLabel}` : ''}`}
                  style={({ pressed }) => [
                    cell,
                    { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: t.space[2] },
                    i < rows.length - 1 ? divider : null,
                    pressStyle(pressed),
                  ]}
                >
                  {row.status.tone ? (
                    <View
                      style={{ width: t.size.dot, height: t.size.dot, borderRadius: t.radius.full, backgroundColor: t.colors[row.status.tone] }}
                    />
                  ) : null}
                  <Text style={[t.type.label14, { color: t.colors.ink, flexShrink: 1 }]} numberOfLines={1}>
                    {row.status.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
