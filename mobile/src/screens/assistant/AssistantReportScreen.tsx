import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import type { RootStackScreenProps } from '../../navigation/types';
import { ApiError, fetchAssistantReport, type AssistantReport } from '../../api/client';
import { friendlyMessage } from '../../components/StateView';
import { useRefreshControl } from '../../components/refresh';
import { formatRelativeTime } from '../../features/time';
import { useFocusLoad } from '../../features/useFocusLoad';
import { useTheme } from '../../theme/ThemeContext';
import {
  useBottomPadding,
  AppBar,
  Button,
  Card,
  EmptyState,
  ListRow,
  Screen,
  SectionTitle,
  SegmentControl,
  Skeleton,
  SkeletonRow,
  StatBox,
} from '../../ui';

type Props = RootStackScreenProps<'AssistantReport'>;
type Range = '7' | '30';

// Asistan raporu: başka firmalar ürünlerinizi sorduğunda asistanınızın ne
// kadarını kendisi karşıladığı, kimlerin sorduğu ve en çok hangi ürünlerin
// sorulduğu (GET /api/assistant/report). Haftalık bildirim buraya açılır.

function headline(r: AssistantReport): string {
  const when = r.days === 7 ? 'bu hafta' : 'son 30 günde';
  const from = r.askerCompanies > 0 ? `${r.askerCompanies} firmadan gelen ` : '';
  return `Asistanınız ${when} ${from}${r.questions} soruyu karşıladı.`;
}

export function AssistantReportScreen({ navigation }: Props) {
  const t = useTheme();
  const bottomPad = useBottomPadding();
  const [range, setRange] = useState<Range>('7');
  const days = range === '7' ? 7 : 30;
  const fetcher = useCallback(() => fetchAssistantReport(days), [days]);
  const { data, status, error, refreshing, reload, refresh } = useFocusLoad(fetcher);
  const refreshCtl = useRefreshControl(refreshing, refresh);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Aralık değişince yeniden çek (ilk açılışı useFocusLoad zaten yapar).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void reload();
  }, [days, reload]);

  const bar = <AppBar title="Asistan raporu" leading="back" onBack={() => navigation.goBack()} />;

  const segment = (
    <SegmentControl<Range>
      options={[
        { value: '7', label: 'Bu hafta' },
        { value: '30', label: 'Son 30 gün' },
      ]}
      value={range}
      onChange={setRange}
      stretch
      accessibilityLabel="Rapor aralığı"
    />
  );

  const wrap = (children: React.ReactNode) => (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      {bar}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: t.space[4],
          paddingBottom: bottomPad,
          paddingHorizontal: t.space[4],
          alignItems: 'center',
        }}
        refreshControl={refreshCtl}
      >
        <View style={{ width: '100%', maxWidth: t.size.maxContentWidth, gap: t.space[6], minWidth: 0 }}>
          {segment}
          {children}
        </View>
      </ScrollView>
    </View>
  );

  if (status === 'error' && error instanceof ApiError && error.status === 403) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar}
        <Screen>
          <EmptyState
            icon="business-outline"
            title="Bu sayfa firmaya bağlı"
            description="Asistan raporu firmanıza gelen soruları gösterir. Bir firmaya bağlandığınızda burada görünür."
          />
        </Screen>
      </View>
    );
  }

  if (status === 'error') {
    return wrap(
      <EmptyState
        icon="warning"
        title="Rapor alınamadı"
        description={friendlyMessage(error, 'Bağlantıyı kontrol edip tekrar deneyin.')}
        actionLabel="Tekrar dene"
        onAction={reload}
      />
    );
  }

  const report = data?.report;
  // İlk yükleme ya da aralık değişip yeni veri henüz gelmediyse iskelet.
  if (status === 'loading' || !report || report.days !== days) {
    return wrap(
      <View style={{ gap: t.space[4] }}>
        <Skeleton height={t.space[10]} />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }

  if (report.questions === 0) {
    return wrap(
      <EmptyState
        icon="stats-chart-outline"
        title={report.days === 7 ? 'Bu hafta soru gelmedi' : 'Son 30 günde soru gelmedi'}
        description="Başka firmalar ürünlerinizi sorduğunda asistanınız cevaplar ve bu rapor dolar. Kataloğunuzu ve sık sorulanları doldurmak asistanınızın daha çok soruyu kendisi cevaplamasını sağlar."
        actionLabel="Sık sorulanları düzenle"
        onAction={() => navigation.navigate('CompanyFaq')}
      />
    );
  }

  return wrap(
    <>
      <Text style={[t.type.title18, { color: t.colors.ink }]}>{headline(report)}</Text>

      <Card style={{ gap: t.space[4] }}>
        <View style={{ flexDirection: 'row', gap: t.space[4] }}>
          <StatBox value={report.questions} label="Gelen soru" />
          <StatBox value={report.askerCompanies} label="Soran firma" />
        </View>
        <View style={{ flexDirection: 'row', gap: t.space[4] }}>
          <StatBox value={report.answeredByAssistant} label="Asistan cevapladı" accent />
          <StatBox value={report.forwarded} label="Size iletilen" />
        </View>
        {report.forwardedOpen > 0 ? (
          <View style={{ gap: t.space[3] }}>
            <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
              {report.forwardedOpen} soru cevabınızı bekliyor.
            </Text>
            <Button label="Soruları cevapla" onPress={() => navigation.navigate('CompanyQuestions')} />
          </View>
        ) : null}
      </Card>

      {report.askers.length > 0 ? (
        <View style={{ gap: t.space[2] }}>
          <SectionTitle title="Kimler sordu" />
          <Card style={{ paddingVertical: 0 }}>
            {report.askers.map((a, i) => (
              <ListRow
                key={`${a.companyName}-${i}`}
                title={a.companyName}
                subtitle={`${a.questions} soru`}
                avatarName={a.companyName}
                avatarKind="company"
                time={formatRelativeTime(a.lastAt)}
                divider={i < report.askers.length - 1}
              />
            ))}
          </Card>
        </View>
      ) : null}

      {report.topProducts.length > 0 ? (
        <View style={{ gap: t.space[2] }}>
          <SectionTitle title="En çok sorulan ürünler" />
          <Card style={{ gap: t.space[3] }}>
            {report.topProducts.map((p) => (
              <View
                key={p.code}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space[3] }}
              >
                <Text numberOfLines={1} style={[t.type.mono14, { color: t.colors.brand, flexShrink: 1 }]}>
                  {p.code}
                </Text>
                <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{p.mentions} kez</Text>
              </View>
            ))}
          </Card>
        </View>
      ) : null}
    </>
  );
}
