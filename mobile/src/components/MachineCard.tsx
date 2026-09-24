// Firma sayfasının Makineler sekmesindeki makine kartı ve sahibin müsaitlik
// alt sayfası. Solda başlık + mono-14 değerler (dar ekranda sarılır), sağda
// sabit genişlikte durum sütunu: nokta + metin (renk tek başına anlam taşımaz).
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { setMachineAvailability, type Machine } from '../api/client';
import { availabilityStatus, busyUntilFromDays, parseBusyDate, QUICK_AVAILABILITY } from '../features/machines/availability';
import { machineCardTitle, machineSpecRows } from '../features/machines/catalog';
import { friendlyMessage } from './StateView';
import { haptics } from '../features/haptics';
import { useTheme } from '../theme/ThemeContext';
import { BottomSheet, Button, Card, Input } from '../ui';
import { tr } from '../i18n';

type StatusMachine = Pick<Machine, 'busyUntil' | 'availabilityUpdatedAt'>;

// Durum göstergesi: arama sonuçlarında da kullanılır.
export function AvailabilityIndicator({ machine, onPress }: { machine: StatusMachine; onPress?: () => void }) {
  const t = useTheme();
  const status = availabilityStatus(machine.busyUntil, machine.availabilityUpdatedAt);
  const content = (
    <View style={{ gap: t.space[1], alignItems: 'flex-end' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
        <View
          style={{ width: t.size.dot, height: t.size.dot, borderRadius: t.radius.full, backgroundColor: t.colors[status.tone] }}
        />
        <Text style={[t.type.label14, { color: t.colors.ink, flexShrink: 1, textAlign: 'right' }]}>{status.label}</Text>
      </View>
      {status.detail ? (
        <Text style={[t.type.body14, { color: t.colors.ink2, textAlign: 'right' }]}>{status.detail}</Text>
      ) : null}
      {status.stale ? (
        <Text style={[t.type.body14, { color: t.colors.ink3, textAlign: 'right' }]}>{status.stale}</Text>
      ) : null}
    </View>
  );
  const a11y = [status.label, status.detail, status.stale].filter(Boolean).join(', ');
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={a11y} style={{ width: t.size.statusColumn }}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${a11y}. ${tr('Müsaitliği güncelle')}`}
      style={({ pressed }) => ({
        width: t.size.statusColumn,
        minHeight: t.size.touchMin,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {content}
    </Pressable>
  );
}

export function MachineCard({
  machine,
  isOwner,
  onEdit,
  onChanged,
}: {
  machine: Machine;
  isOwner: boolean;
  onEdit?: () => void;
  onChanged?: (machine: Machine) => void;
}) {
  const t = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { title, kindDetail } = machineCardTitle(machine);
  const specs = machineSpecRows(machine);

  return (
    <Card onPress={isOwner ? onEdit : undefined} accessibilityLabel={isOwner ? tr('{title}, düzenle', { title }) : undefined}>
      <View style={{ flexDirection: 'row', gap: t.space[3], alignItems: 'flex-start' }}>
        <View style={{ flex: 1, minWidth: 0, gap: t.space[2] }}>
          <View style={{ gap: t.space[1] }}>
            <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>{title}</Text>
            {kindDetail || machine.feature || machine.fabricType ? (
              <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                {[machine.fabricType, kindDetail, machine.feature].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: t.space[4], rowGap: t.space[1] }}>
            {specs.map((row) => (
              <View key={row.label} style={{ flexDirection: 'row', alignItems: 'baseline', gap: t.space[1] }}>
                <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{row.label}</Text>
                <Text style={[t.type.mono14, { color: t.colors.ink }]}>{row.value}</Text>
              </View>
            ))}
          </View>
          {machine.note ? <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{machine.note}</Text> : null}
        </View>
        <AvailabilityIndicator machine={machine} onPress={isOwner ? () => setSheetOpen(true) : undefined} />
      </View>
      {isOwner ? (
        <AvailabilitySheet
          machine={machine}
          title={title}
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onSaved={(updated) => {
            setSheetOpen(false);
            onChanged?.(updated);
          }}
        />
      ) : null}
    </Card>
  );
}

// Sahibin tek dokunuşla müsaitlik güncellemesi (makine tablosu da kullanır).
export function AvailabilitySheet({
  machine,
  title,
  visible,
  onClose,
  onSaved,
}: {
  machine: Machine;
  title: string;
  visible: boolean;
  onClose: () => void;
  onSaved: (machine: Machine) => void;
}) {
  const t = useTheme();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [dateText, setDateText] = useState('');
  const [dateError, setDateError] = useState<string | null>(null);

  const save = async (key: string, busyUntil: string | null) => {
    setSaving(key);
    setError(null);
    try {
      const res = await setMachineAvailability(machine.id, busyUntil);
      haptics.success();
      setDateOpen(false);
      setDateText('');
      onSaved(res.machine);
    } catch (err) {
      haptics.error();
      setError(friendlyMessage(err, tr('Durum kaydedilemedi')));
    } finally {
      setSaving(null);
    }
  };

  const saveDate = () => {
    const parsed = parseBusyDate(dateText);
    setDateError(parsed.error);
    if (parsed.iso) save('date', parsed.iso);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={tr('Müsaitlik')}>
      <View style={{ gap: t.space[3] }}>
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{title}</Text>
        {QUICK_AVAILABILITY.map((option) => (
          <Button
            key={option.label}
            kind="secondary"
            label={option.label}
            fullWidth
            loading={saving === option.label}
            disabled={saving !== null}
            onPress={() => save(option.label, busyUntilFromDays(option.days))}
          />
        ))}
        {dateOpen ? (
          <View style={{ gap: t.space[2] }}>
            <Input
              label={tr('Dolu olduğu son gün')}
              value={dateText}
              onChangeText={setDateText}
              placeholder={tr('GG.AA.YYYY')}
              inputMode="numeric"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              error={dateError}
              onSubmitEditing={saveDate}
            />
            <Button label={tr('Kaydet')} fullWidth loading={saving === 'date'} disabled={saving !== null} onPress={saveDate} />
          </View>
        ) : (
          <Button kind="quiet" label={tr('Tarih seç')} icon="calendar-outline" fullWidth onPress={() => setDateOpen(true)} />
        )}
        {error ? <Text style={[t.type.body14, { color: t.colors.danger }]}>{error}</Text> : null}
      </View>
    </BottomSheet>
  );
}
