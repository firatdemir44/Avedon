import React, { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { fetchCompanyCollaborations, fetchProductCollaborations, type PublicCollaboration } from '../api/client';
import { CompanyAvatar } from './CompanyAvatar';
import { Badge, Card, Icon, ListRow, SectionTitle } from '../ui';
import { useTheme } from '../theme/ThemeContext';
import { tr } from '../i18n';

interface Props {
  /** Firma sayfası: bu firmanın yayınlanmış iş birlikleri. */
  companyId?: string;
  /** Ürün detayı: bu kumaşla çalışan firmalar. */
  productId?: string;
  title: string;
  /** Kendi firmanızda: "Yönet" bağlantısı (seçim ekranı). Verilirse boş liste de gösterilir. */
  onManage?: () => void;
}

// Doğrulanmış iş birliği listesi (Bölüm C, madde 14). Yalnızca iki tarafın da göstermeyi
// seçtiği kayıtlar gelir; karşı taraf kendi seçimine göre adıyla ya da adsız görünür.
// Ekranda yalnızca firma (ya da adsız ifade), ürün ve yıl vardır. Boşsa bölüm çizilmez
// (sahibinde "Yönet" bağlantısı olduğu için kısa boş metinle çizilir).
export function CollaborationSection({ companyId, productId, title, onManage }: Props) {
  const t = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [rows, setRows] = useState<PublicCollaboration[] | null>(null);

  const load = useCallback(() => {
    const p = productId ? fetchProductCollaborations(productId) : companyId ? fetchCompanyCollaborations(companyId) : null;
    if (!p) return;
    p.then((r) => setRows(r.collaborations)).catch(() => setRows((prev) => prev ?? []));
  }, [companyId, productId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!rows || (rows.length === 0 && !onManage)) return null;

  const subtitleOf = (c: PublicCollaboration) =>
    [c.sourceLabel, String(c.year), c.product ? `${c.product.code} · ${c.product.typeLabel}` : ''].filter(Boolean).join(' · ');

  return (
    <View style={{ gap: t.space[2] }}>
      <SectionTitle title={title} linkLabel={onManage ? tr('Yönet') : undefined} onLinkPress={onManage} />
      {rows.length === 0 ? (
        <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{tr('Henüz yayınlanan iş birliği yok.')}</Text>
      ) : (
        <Card noPadding>
          <View style={{ paddingHorizontal: t.space[4] }}>
            {rows.map((c, index) => {
              const company = c.counterparty.company;
              return (
                <ListRow
                  key={c.id}
                  title={company ? company.name : c.counterparty.anonymousLabel ?? tr('Bir firma')}
                  subtitle={subtitleOf(c)}
                  left={
                    company ? (
                      <CompanyAvatar name={company.name} verification={company.verification} companyId={company.id} logoUpdatedAt={company.logoUpdatedAt} />
                    ) : (
                      <AnonymousAvatar />
                    )
                  }
                  right={<Badge kind="collaboration" />}
                  divider={index < rows.length - 1}
                  onPress={company ? () => navigation.push('CompanyProfile', { companyId: company.id }) : undefined}
                />
              );
            })}
          </View>
        </Card>
      )}
    </View>
  );
}

// Adsız taraf: firma avatarı ölçüsünde nötr kare + kişi-dışı ikon (kimlik ima etmez).
function AnonymousAvatar() {
  const t = useTheme();
  return (
    <View
      accessibilityLabel={tr('Adsız firma')}
      style={{
        width: t.size.avatar,
        height: t.size.avatar,
        borderRadius: t.radius.sm,
        backgroundColor: t.colors.surface2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="business-outline" size={t.size.iconSm} color="ink3" />
    </View>
  );
}
