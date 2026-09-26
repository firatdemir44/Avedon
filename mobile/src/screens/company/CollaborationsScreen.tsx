// Doğrulanmış iş birlikleri — seçim ekranı (docs/konfeksiyon-plani.md Bölüm C, madde 10–11, 14).
// Her firma yalnızca KENDİ adının karşı tarafın sayfasında nasıl görüneceğini seçer:
// Firma adıyla göster · Adsız göster · Gösterme (varsayılan). İki taraf da "Gösterme" dışında
// seçerse yayınlanır; biri geri alırsa iki sayfadan da kalkar. Taraflar burada birbirinin
// gerçek adını görür (özel liste); herkese açık sayfalarda seçime göre adsızlaşır.
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { fetchMyCollaborations, setCollaborationChoice, type CollaborationChoice, type MyCollaboration } from '../../api/client';
import { useFocusLoad } from '../../features/useFocusLoad';
import { ErrorState, friendlyMessage } from '../../components/StateView';
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { haptics } from '../../features/haptics';
import { useSession } from '../../context/SessionContext';
import { useTheme } from '../../theme/ThemeContext';
import { tr } from '../../i18n';
import { AppBar, Badge, Card, Chip, ChipRow, EmptyState, Icon, Screen, SkeletonRow } from '../../ui';

type Props = RootStackScreenProps<'Collaborations'>;
type Choice = Exclude<CollaborationChoice, 'bekliyor'>;

const CHOICES: { value: Choice; label: string }[] = [
  { value: 'adli', label: 'Firma adıyla göster' },
  { value: 'adsiz', label: 'Adsız göster' },
  { value: 'gosterme', label: 'Gösterme' },
];

// "bekliyor" ekranda Gösterme ile aynı.
const asChoice = (c: CollaborationChoice): Choice => (c === 'bekliyor' ? 'gosterme' : c);

export function CollaborationsScreen({ navigation, route }: Props) {
  const t = useTheme();
  const { user } = useSession();
  const focusId = route.params?.focusId;
  const { data, setData, status, error, reload } = useFocusLoad(fetchMyCollaborations, { enabled: !!user?.companyId });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Bildirimden gelen kayıt en üstte.
  const rows = useMemo(() => {
    const list = data?.collaborations ?? [];
    if (!focusId) return list;
    const hit = list.find((c) => c.id === focusId);
    return hit ? [hit, ...list.filter((c) => c.id !== focusId)] : list;
  }, [data, focusId]);

  const choose = async (row: MyCollaboration, choice: Choice) => {
    if (busyId || asChoice(row.myChoice) === choice) return;
    setBusyId(row.id);
    setActionError(null);
    try {
      const { collaboration } = await setCollaborationChoice(row.id, choice);
      haptics.success();
      setData((prev) =>
        prev
          ? {
              ...prev,
              collaborations: prev.collaborations.map((c) => (c.id === row.id && collaboration ? collaboration : c)),
              pendingCount: prev.collaborations.filter((c) => c.id !== row.id && c.pending).length,
            }
          : prev
      );
    } catch (err) {
      haptics.error();
      setActionError(friendlyMessage(err, tr('Seçim kaydedilemedi')));
    } finally {
      setBusyId(null);
    }
  };

  const header = <AppBar title={tr('İş birlikleri')} leading="back" onBack={() => navigation.goBack()} />;

  if (!user?.companyId) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {header}
        <Screen>
          <EmptyState icon="link-outline" title={tr('Önce firmanızı ekleyin')} description={tr('İş birlikleri firmanız adına kaydedilir.')} />
        </Screen>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {header}
        {status === 'error' ? (
          <ErrorState error={error} fallback={tr('İş birlikleri alınamadı')} onRetry={reload} />
        ) : (
          <View style={{ padding: t.space[4] }}>
            <SkeletonRow />
            <SkeletonRow />
          </View>
        )}
      </View>
    );
  }

  const muted = [t.type.body14, { color: t.colors.ink2 }];

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      {header}
      <Screen>
        <Text style={muted}>
          {tr(
            'Numune ya da sipariş teslim edilince iş birliği kaydı oluşur. Yalnızca kendi adınızın karşı tarafın sayfasında nasıl görüneceğini seçersiniz; miktar, fiyat ve gün hiçbir zaman gösterilmez, yalnızca yıl.'
          )}
        </Text>
        {actionError ? <Text style={[t.type.body14, { color: t.colors.danger }]}>{actionError}</Text> : null}

        {rows.length === 0 ? (
          <Card>
            <EmptyState
              icon="link-outline"
              title={tr('Henüz iş birliği kaydı yok')}
              description={tr('Platformda teslim edilen ilk numune ya da siparişle burada görünür.')}
            />
          </Card>
        ) : (
          rows.map((row) => {
            const mine = asChoice(row.myChoice);
            const theirsShowing = row.theirChoice === 'adli' || row.theirChoice === 'adsiz';
            const state = row.published
              ? tr('Yayında: iki firmanın sayfasında görünüyor.')
              : mine === 'gosterme'
                ? tr('Yayında değil: siz göstermeyi seçmediniz.')
                : theirsShowing
                  ? tr('Yayında değil.')
                  : tr('Yayında değil: karşı tarafın seçimi bekleniyor.');
            const subtitle = [row.sourceLabel, String(row.year), row.product ? `${row.product.code} · ${row.product.typeLabel}` : ''].filter(Boolean).join(' · ');
            return (
              <Card key={row.id}>
                <View style={{ gap: t.space[3] }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
                    <CompanyAvatar
                      name={row.counterparty?.name}
                      verification={row.counterparty?.verification}
                      companyId={row.counterparty?.id}
                      logoUpdatedAt={row.counterparty?.logoUpdatedAt}
                    />
                    <View style={{ flex: 1, minWidth: 0, gap: t.space[1] / 2 }}>
                      <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>{row.counterparty?.name ?? tr('Bir firma')}</Text>
                      <Text style={muted}>{subtitle}</Text>
                    </View>
                    {row.pending ? <Badge kind="pending" label={tr('SEÇİM BEKLİYOR')} /> : row.published ? <Badge kind="collaboration" /> : null}
                  </View>

                  <Text style={[t.type.label14, { color: t.colors.ink2 }]}>
                    {row.role === 'supplier'
                      ? tr('Bu firmanın sayfasında adınız nasıl görünsün?')
                      : tr('Bu tedarikçinin sayfasında ve kumaşın ürün sayfasında adınız nasıl görünsün?')}
                  </Text>
                  <ChipRow wrap>
                    {CHOICES.map((c) => (
                      <Chip
                        key={c.value}
                        label={tr(c.label)}
                        selected={mine === c.value}
                        disabled={busyId === row.id}
                        onPress={() => void choose(row, c.value)}
                      />
                    ))}
                  </ChipRow>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
                    <Icon name={row.published ? 'eye-outline' : 'eye-off-outline'} size={t.size.iconSm} color={row.published ? 'success' : 'ink3'} />
                    <Text style={[t.type.body14, { color: row.published ? t.colors.success : t.colors.ink2, flex: 1 }]}>{state}</Text>
                  </View>
                  <Text style={[t.type.caption12, { color: t.colors.ink3 }]}>{tr('Yalnızca iki taraf da göstermeyi seçerse yayınlanır.')}</Text>
                </View>
              </Card>
            );
          })
        )}
      </Screen>
    </View>
  );
}
