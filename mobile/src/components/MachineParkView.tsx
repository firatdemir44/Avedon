// Firma sayfası Makineler sekmesinin listesi: özet satırı, süzgeç çipleri,
// Tablo | Kart görünümü (varsayılan Tablo). Tablo firmanın kendi parkur
// tablosunu taklit eder (No · Pus · Fine · Marka · İğne · Sistem · Örgü cinsi · Durum).
// Sahibi satıra dokununca düzenler, Durum'a dokununca müsaitliği günceller;
// ziyaretçi satıra dokununca makine kartını alt sayfada görür.
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import type { Machine } from '../api/client';
import { availabilityShort } from '../features/machines/availability';
import { machineCardTitle } from '../features/machines/catalog';
import { rangeDisplay } from '../features/machines/range';
import { formatMeasure } from '../features/calculators/parse';
import { haptics } from '../features/haptics';
import { useTheme } from '../theme/ThemeContext';
import { BottomSheet, Chip, ChipRow, SegmentControl } from '../ui';
import { AvailabilitySheet, MachineCard } from './MachineCard';
import { MachineTable, type MachineTableRow } from './MachineTable';
import { locale, tr } from '../i18n';

type ViewMode = 'table' | 'cards';
type StatusFilter = 'all' | 'available' | 'busy';

// No'ya göre (numarasızlar sonda), sonra eklenme sırası (sunucu sırası korunur).
export function sortMachines(machines: Machine[]): Machine[] {
  return machines
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const an = a.m.machineNo ?? Number.POSITIVE_INFINITY;
      const bn = b.m.machineNo ?? Number.POSITIVE_INFINITY;
      return an !== bn ? an - bn : a.i - b.i;
    })
    .map(({ m }) => m);
}

export function machineToTableRow(m: Machine, now = new Date()): MachineTableRow {
  const status = availabilityShort(m.busyUntil, now);
  const { title } = machineCardTitle(m);
  const fine = rangeDisplay(m.gaugeText, m.gauge);
  const needles = rangeDisplay(m.needlesText, m.needles);
  return {
    key: m.id,
    no: m.machineNo != null ? String(m.machineNo) : '',
    pus: m.diameterInch != null ? formatMeasure(m.diameterInch) : '',
    fine,
    brand: [m.brand, m.model].filter(Boolean).join(' '),
    needles,
    feeders: m.feeders != null ? String(m.feeders) : '',
    fabric: m.fabricType || m.feature,
    status: { tone: status.tone, label: status.label },
    a11y: [
      m.machineNo != null ? tr('{n} numara', { n: m.machineNo }) : null,
      title,
      m.diameterInch != null ? tr('{n} pus', { n: formatMeasure(m.diameterInch) }) : null,
      fine ? tr('{n} fine', { n: fine }) : null,
      m.fabricType || null,
      status.label,
    ]
      .filter(Boolean)
      .join(', '),
  };
}

export function MachineParkView({
  machines,
  isOwner,
  onEdit,
  onChanged,
}: {
  machines: Machine[];
  isOwner: boolean;
  onEdit: (machine: Machine) => void;
  onChanged: (machine: Machine) => void;
}) {
  const t = useTheme();
  const [mode, setMode] = useState<ViewMode>('table');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [fabric, setFabric] = useState<string | null>(null);
  const [availabilityFor, setAvailabilityFor] = useState<Machine | null>(null);
  const [detailFor, setDetailFor] = useState<Machine | null>(null);

  const now = new Date();
  const sorted = useMemo(() => sortMachines(machines), [machines]);

  // Adetli kayıtlar (count > 1) özet sayısına adetleriyle girer.
  const summary = useMemo(() => {
    let total = 0;
    let available = 0;
    for (const m of machines) {
      total += m.count;
      if (availabilityShort(m.busyUntil).available) available += m.count;
    }
    return { total, available, busy: total - available };
  }, [machines]);

  const fabricTypes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const m of sorted) {
      const f = m.fabricType.trim();
      if (f && !seen.has(f.toLocaleLowerCase(locale()))) seen.set(f.toLocaleLowerCase(locale()), f);
    }
    return [...seen.values()];
  }, [sorted]);

  const visible = sorted.filter((m) => {
    const s = availabilityShort(m.busyUntil, now);
    if (status === 'available' && !s.available) return false;
    if (status === 'busy' && s.available) return false;
    if (fabric && m.fabricType.trim().toLocaleLowerCase(locale()) !== fabric.toLocaleLowerCase(locale())) return false;
    return true;
  });

  const byId = (id: string) => machines.find((m) => m.id === id) ?? null;
  const pick = <T,>(set: (v: T) => void, v: T) => {
    haptics.selection();
    set(v);
  };

  return (
    <View style={{ gap: t.space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space[3], flexWrap: 'wrap' }}>
        <Text style={[t.type.body14, { color: t.colors.ink2, flexShrink: 1 }]}>
          <Text style={[t.type.mono14, { color: t.colors.ink }]}>{summary.total}</Text> {tr('makine')} ·{' '}
          <Text style={[t.type.mono14, { color: t.colors.ink }]}>{summary.available}</Text> {tr('müsait')} ·{' '}
          <Text style={[t.type.mono14, { color: t.colors.ink }]}>{summary.busy}</Text> {tr('dolu')}
        </Text>
        <SegmentControl<ViewMode>
          accessibilityLabel={tr('Görünüm')}
          value={mode}
          onChange={(v) => pick(setMode, v)}
          options={[
            { value: 'table', label: tr('Tablo') },
            { value: 'cards', label: tr('Kart') },
          ]}
        />
      </View>

      <ChipRow>
        <Chip
          label={tr('Tümü')}
          selected={status === 'all' && !fabric}
          onPress={() => {
            haptics.selection();
            setStatus('all');
            setFabric(null);
          }}
        />
        <Chip label={tr('Müsait')} selected={status === 'available'} onPress={() => pick(setStatus, status === 'available' ? 'all' : 'available')} />
        <Chip label={tr('Dolu')} selected={status === 'busy'} onPress={() => pick(setStatus, status === 'busy' ? 'all' : 'busy')} />
        {fabricTypes.map((f) => (
          <Chip key={f} label={f} selected={fabric === f} onPress={() => pick(setFabric, fabric === f ? null : f)} />
        ))}
      </ChipRow>

      {!visible.length ? (
        <Text style={[t.type.body14, { color: t.colors.ink2, textAlign: 'center', paddingVertical: t.space[4] }]}>
          {tr('Bu süzgece uyan makine yok.')}
        </Text>
      ) : mode === 'table' ? (
        <MachineTable
          rows={visible.map((m) => machineToTableRow(m, now))}
          rowActionLabel={isOwner ? tr('Düzenle') : tr('Ayrıntı')}
          statusActionLabel={tr('Müsaitliği güncelle')}
          onRowPress={(id) => {
            const m = byId(id);
            if (!m) return;
            if (isOwner) onEdit(m);
            else setDetailFor(m);
          }}
          onStatusPress={
            isOwner
              ? (id) => setAvailabilityFor(byId(id))
              : (id) => setDetailFor(byId(id))
          }
        />
      ) : (
        visible.map((machine) => (
          <MachineCard key={machine.id} machine={machine} isOwner={isOwner} onEdit={() => onEdit(machine)} onChanged={onChanged} />
        ))
      )}

      {isOwner && availabilityFor ? (
        <AvailabilitySheet
          machine={availabilityFor}
          title={[availabilityFor.machineNo != null ? tr('No {n}', { n: availabilityFor.machineNo }) : null, machineCardTitle(availabilityFor).title]
            .filter(Boolean)
            .join(' · ')}
          visible
          onClose={() => setAvailabilityFor(null)}
          onSaved={(updated) => {
            setAvailabilityFor(null);
            onChanged(updated);
          }}
        />
      ) : null}

      <BottomSheet visible={detailFor !== null} onClose={() => setDetailFor(null)} title={tr('Makine')}>
        {detailFor ? <MachineCard machine={detailFor} isOwner={false} /> : null}
      </BottomSheet>
    </View>
  );
}
