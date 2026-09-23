// Makine parkı (yeni tasarım, 4. adım — DESIGN.md §2/§3).
//
// Faz 2, Adım 5'teki veri katmanı aynen duruyor: üstte kapasite formu (aylık
// tonaj + fason açık + not), altında gruplanmış makine listesi (satıra dokun →
// düzenle, çöp → sil). Ekleme/düzenleme ayrı ekranda (MachineForm).
//
// Görünüm yeni: AppBar + Screen, alanlar ui/Input, liste ui/ListRow,
// boş durum ui/EmptyState; ekranın tek dolu düğmesi yapışkan "Makine ekle".
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Switch, Pressable } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import {
  ApiError,
  deleteMachine,
  fetchCompanyMachines,
  saveCapacity,
  type Machine,
} from '../../api/client';
import { ErrorState, friendlyMessage } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { useSession } from '../../context/SessionContext';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { useFocusLoad } from '../../features/useFocusLoad';
import { toInputNumber } from '../../features/calculators/parse';
import { groupMachines, machineSummary } from '../../features/machines/catalog';
import { useTheme } from '../../theme/ThemeContext';
import {
  useBottomPadding,
  AppBar,
  Button,
  Card,
  EmptyState,
  Icon,
  Input,
  ListRow,
  Screen,
  SectionTitle,
  SkeletonRow,
} from '../../ui';

type Props = RootStackScreenProps<'MachinePark'>;

const NUMBER_PATTERN = /^\d+([.,]\d+)?$/;

export function MachineParkScreen({ navigation }: Props) {
  const t = useTheme();
  const bottomPad = useBottomPadding();
  const { user } = useSession();
  const companyId = user?.companyId ?? null;

  // Başlık ekranın kendi AppBar'ında; gezinti başlığı kapatılır.
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(
    () => fetchCompanyMachines(companyId as string),
    { enabled: !!companyId }
  );

  const [tons, setTons] = useState('');
  const [contractOpen, setContractOpen] = useState(false);
  const [note, setNote] = useState('');
  // Kapasite formu yalnızca ilk veri gelince dolduruluyor: odak yenilemesi
  // kullanıcının yazdığını silmesin.
  const [filled, setFilled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (filled || !data) return;
    setTons(data.capacity.monthlyCapacityTons == null ? '' : toInputNumber(data.capacity.monthlyCapacityTons));
    setContractOpen(data.capacity.contractOpen);
    setNote(data.capacity.note);
    setFilled(true);
  }, [data, filled]);

  const save = useCallback(async () => {
    const trimmed = tons.trim();
    if (trimmed && !NUMBER_PATTERN.test(trimmed)) {
      setFormError('Aylık kapasiteye yalnızca rakam girin (ondalık için virgül).');
      haptics.error();
      return;
    }
    setSaving(true);
    setFormError(null);
    setSaved(false);
    try {
      await saveCapacity({
        monthlyCapacityTons: trimmed ? Number(trimmed.replace(',', '.')) : null,
        note: note.trim(),
        contractOpen,
      });
      haptics.success();
      setSaved(true);
      await reload();
    } catch (err) {
      haptics.error();
      if (err instanceof ApiError && err.code === 'no_company') {
        setFormError('Kapasite firmaya bağlıdır.');
      } else {
        setFormError(friendlyMessage(err, 'Kaydedilemedi, tekrar deneyin.'));
      }
    } finally {
      setSaving(false);
    }
  }, [contractOpen, note, reload, tons]);

  const remove = useCallback(
    async (machine: Machine) => {
      const ok = await confirmAction({
        title: 'Makine silinsin mi?',
        message: `"${machine.kind}" makine parkınızdan silinecek. Fason kapasite aramalarında artık görünmez.`,
        confirmLabel: 'Sil',
        destructive: true,
      });
      if (!ok) return;
      try {
        await deleteMachine(machine.id);
        haptics.success();
        await reload();
      } catch (err) {
        haptics.error();
        setFormError(friendlyMessage(err, 'Silinemedi, tekrar deneyin.'));
      }
    },
    [reload]
  );

  const bar = <AppBar title="Makine parkı" leading="back" onBack={() => navigation.goBack()} />;

  if (!companyId) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar}
        <Screen>
          <EmptyState
            icon="machine"
            title="Makine parkı firmaya bağlı"
            description="Bir firmaya bağlandığında makine parkını ve aylık kapasiteni girebilirsin."
          />
        </Screen>
      </View>
    );
  }

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar}
        <Screen>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </Screen>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar}
        <ErrorState error={error} fallback="Makine parkı alınamadı" onRetry={reload} />
      </View>
    );
  }

  const machines = data?.machines ?? [];
  const sections = groupMachines(machines);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      {bar}

      <Screen
        scroll={false}
        noPadding
        contentStyle={{ paddingTop: 0, gap: 0 }}
        sticky={
          <Button
            size="lg"
            label="Makine ekle"
            icon="plus"
            onPress={() => navigation.navigate('MachineForm')}
          />
        }
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: bottomPad }}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl(refreshing, refresh)}
        >
          <View style={{ paddingHorizontal: t.space[4], paddingTop: t.space[4], gap: t.space[6] }}>
            <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
              Makine parkın ve aylık kapasiten firma sayfanda görünür; fason iş arayan alıcılar buradan seni bulur.
            </Text>

            <View style={{ gap: t.space[2] }}>
              <SectionTitle title="Kapasite" />
              <Card>
                <View style={{ gap: t.space[3] }}>
                  <Input
                    label="Aylık kapasite"
                    unit="ton"
                    value={tons}
                    onChangeText={(text) => {
                      setTons(text);
                      setSaved(false);
                    }}
                    placeholder="Örn. 120"
                    inputMode="decimal"
                    keyboardType="decimal-pad"
                  />

                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: t.space[3],
                      minHeight: t.size.touchMin,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0, gap: t.space[1] / 2 }}>
                      <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>Fason kapasitesi açık</Text>
                      <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                        Açıkken fason arayanların aramalarında öne çıkarsın.
                      </Text>
                    </View>
                    <Switch
                      value={contractOpen}
                      onValueChange={(value) => {
                        haptics.selection();
                        setContractOpen(value);
                        setSaved(false);
                      }}
                      trackColor={{ true: t.colors.brand, false: t.colors.lineStrong }}
                      accessibilityLabel="Fason kapasitesi açık"
                    />
                  </View>

                  <Input
                    label="Not"
                    value={note}
                    onChangeText={(text) => {
                      setNote(text);
                      setSaved(false);
                    }}
                    placeholder="Örn. Ekim ortasından itibaren boş kapasite"
                    maxLength={300}
                    multiline
                  />

                  {formError ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: t.space[2],
                        padding: t.space[3],
                        borderRadius: t.radius.md,
                        backgroundColor: t.colors.dangerSoft,
                      }}
                    >
                      <Icon name="warning" size={t.size.iconSm} color="danger" />
                      <Text style={[t.type.body14, { color: t.colors.danger, flex: 1, minWidth: 0 }]}>{formError}</Text>
                    </View>
                  ) : null}
                  {saved && !formError ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
                      <Icon name="check" size={t.size.iconSm} color="success" />
                      <Text style={[t.type.body14, { color: t.colors.success, flex: 1, minWidth: 0 }]}>
                        Kapasite bilgisi kaydedildi.
                      </Text>
                    </View>
                  ) : null}

                  {/* Ekranın tek dolu düğmesi "Makine ekle" (yapışkan çubukta);
                      kapasite kaydı kenarlıklı. */}
                  <Button
                    kind="secondary"
                    fullWidth
                    label="Kapasiteyi kaydet"
                    loading={saving}
                    disabled={saving}
                    onPress={() => void save()}
                  />
                </View>
              </Card>
            </View>

            {machines.length ? (
              sections.map((section) => (
                <View key={section.group} style={{ gap: t.space[2] }}>
                  <SectionTitle title={`${section.label} (${section.count})`} />
                  <Card noPadding style={{ paddingHorizontal: t.space[4] }}>
                    {section.items.map((machine, index) => {
                      const summary = [machineSummary(machine), machine.note].filter(Boolean).join(' · ');
                      return (
                        <View key={machine.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <ListRow
                            style={{ flex: 1, minWidth: 0 }}
                            title={`${machine.kind}  × ${machine.count}`}
                            subtitle={summary}
                            left={
                              <View
                                style={{
                                  width: t.size.avatar,
                                  height: t.size.avatar,
                                  borderRadius: t.radius.sm,
                                  backgroundColor: t.colors.brandSoft,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Icon name="machine" size={t.size.iconSm} color="brand" />
                              </View>
                            }
                            divider={index < section.items.length - 1}
                            onPress={() => navigation.navigate('MachineForm', { machineId: machine.id })}
                          />
                          {/* Çöp ikonu satırın YANINDA: web'de iç içe düğme olmasın. */}
                          <Pressable
                            onPress={() => void remove(machine)}
                            accessibilityRole="button"
                            accessibilityLabel={`Sil: ${machine.kind}`}
                            style={({ pressed }) => [
                              {
                                width: t.size.touchMin,
                                height: t.size.touchMin,
                                alignItems: 'center',
                                justifyContent: 'center',
                              },
                              pressed ? { opacity: 0.6 } : null,
                            ]}
                          >
                            <Icon name="trash-outline" size={t.size.iconSm} color="danger" />
                          </Pressable>
                        </View>
                      );
                    })}
                  </Card>
                </View>
              ))
            ) : (
              <EmptyState
                icon="machine"
                title="Henüz makine eklemedin"
                description="Makinelerini girdiğinde fason iş arayanlar seni pus, fayn ve çalışma enine göre bulabilir."
              />
            )}
          </View>
        </ScrollView>
      </Screen>
    </View>
  );
}
