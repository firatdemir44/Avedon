// Firma sayfası — yeni tasarım (DESIGN.md, artboard 4 "Firma sayfası").
// Düzen: AppBar · kimlik bloğu (64px logo, ad, rozet, iki bilgi satırı) ·
// tek satır eylem dizisi · 4 sütunlu istatistik kartı · alt çizgili sekme şeridi.
// Veri/işlev katmanı eski sürümden aynen taşındı: api/client çağrıları, sekme
// mantığı, referanslar, makine parkı, firma akışı, galeriler, kendi firmasındaki
// yönetim eylemleri. Bu dosyada ham hex/px yok; her değer useTheme() token'ı.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Image, Linking, Pressable, Share } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import {
  ApiError,
  createReference,
  deletePost,
  deleteReference,
  fetchCompany,
  fetchCompanyFeed,
  fetchCompanyMachines,
  fetchCompanyQuestions,
  fetchProductDrafts,
  fetchCompanyReferences,
  fetchCompanyTrust,
  fetchMyClaim,
  type CompanyClaim,
  fetchDeals,
  fetchQuoteRequests,
  likePost,
  respondToReference,
  unlikePost,
  type CompanyCapacity,
  type CompanyEmployee,
  type CompanyReference,
  type CompanyReferences,
  type CompanyTrust,
  type FeedPost,
  type Machine,
  type ReferenceRelation,
} from '../../api/client';
import { monthlyCapacityText } from '../../features/machines/catalog';
import { MachineParkView } from '../../components/MachineParkView';
import { formatMonthYear, formatRelativeTime } from '../../features/time';
import { useFocusLoad } from '../../features/useFocusLoad';
import { friendlyMessage, isNotFound } from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { useSession } from '../../context/SessionContext';
import { CompanyPhotoGallery } from '../../components/CompanyPhotoGallery';
import { UserAvatar } from '../../components/UserAvatar';
import { TrustSummaryCard } from '../../components/TrustSummaryCard';
import { PostCard } from '../feed/PostCard';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { markFeedStale } from '../../features/feed/feedRefresh';
import { companyCompleteness } from '../../features/companies/completeness';
import { companyLogoKey, getCachedCompanyLogo, loadCompanyLogo } from '../../features/companies/companyLogoCache';
import { getCachedProductImage, loadProductImage } from '../../features/products/productImageCache';
import { PRODUCT_TYPES, TYPE_LABELS, USAGES, companyTypeLabel, type ProductType } from '../../features/products/catalog';
import { useTheme } from '../../theme/ThemeContext';
import {
  useBottomPadding,
  AppBar,
  Badge,
  Button,
  ButtonRow,
  Card,
  Chip,
  EmptyState,
  Icon,
  Input,
  ListRow,
  Screen,
  SectionTitle,
  Skeleton,
  SkeletonRow,
  StatBox,
} from '../../ui';
import type { Product } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'CompanyProfile'>;

// Sekmeler (2026-09-23): Ürünler · Makineler · Hakkında · Kişiler · Belgeler.
// Şerit yatay kaydırılır, sekme adı kısaltılmaz. Eski initialTab: 'machines'
// bağlantıları (kapasite araması, asistan) doğrudan Makineler sekmesini açar. "Firma akışı" şeritte yok ama initialTab: 'feed' ile
// açılan eski bağlantılar kırılmasın diye içerik korunuyor.
type CompanyTab = 'products' | 'about' | 'people' | 'docs' | 'machines' | 'feed';

const TABS: { key: CompanyTab; label: string }[] = [
  { key: 'products', label: 'Ürünler' },
  { key: 'machines', label: 'Makineler' },
  { key: 'about', label: 'Hakkında' },
  { key: 'people', label: 'Kişiler' },
  { key: 'docs', label: 'Belgeler' },
];

export function CompanyProfileScreen({ navigation, route }: Props) {
  const t = useTheme();
  const bottomPad = useBottomPadding();
  const { user } = useSession();
  const viewedCompanyId = route.params?.companyId ?? user?.companyId ?? null;
  const isOwnCompany = !!user?.companyId && viewedCompanyId === user.companyId;
  const [tab, setTab] = useState<CompanyTab>(
    route.params?.initialTab ?? 'about'
  );
  const [typeFilter, setTypeFilter] = useState<ProductType | null>(null);
  const [usageFilter, setUsageFilter] = useState<string | null>(null);

  // Kendi üst bandımızı çiziyoruz (AppBar); yığının başlığı kapanıyor.
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Ürün ekleyip / firmayı düzenleyip geri dönünce sayfa iskelete dönmüyor,
  // güncel bilgi sessizce geliyor.
  const { data: company, status, error, refreshing, reload, refresh } = useFocusLoad(
    () => fetchCompany(viewedCompanyId as string).then(({ company: fetched }) => fetched),
    { enabled: !!viewedCompanyId }
  );

  // Kendi firmasında: açık (henüz teklif verilmemiş) istek sayısı, satırda
  // gösterilir. Hata sessiz: sayı görünmez, satır yine çalışır.
  const [openQuoteRequests, setOpenQuoteRequests] = useState(0);
  // Faz 2, Adım 3: asistana gelip henüz cevaplanmamış soru sayısı (aynı desen).
  const [openQuestions, setOpenQuestions] = useState(0);
  // Faz 3, Adım 4: firmanın değerlendirme bekleyen sipariş kayıtları.
  const [pendingDealReviews, setPendingDealReviews] = useState(0);
  // WhatsApp'tan gelip henüz ürüne çevrilmemiş taslak sayısı.
  const [pendingDrafts, setPendingDrafts] = useState(0);
  useFocusEffect(
    useCallback(() => {
      if (!isOwnCompany) return;
      let cancelled = false;
      fetchProductDrafts()
        .then(({ drafts }) => {
          if (!cancelled) setPendingDrafts(drafts.length);
        })
        .catch(() => {});
      fetchDeals('seller')
        .then(({ deals }) => {
          if (!cancelled) setPendingDealReviews(deals.filter((d) => d.canReview).length);
        })
        .catch(() => {});
      fetchQuoteRequests('seller')
        .then(({ requests }) => {
          if (!cancelled) setOpenQuoteRequests(requests.filter((r) => r.status === 'open').length);
        })
        .catch(() => {});
      fetchCompanyQuestions()
        .then(({ openCount }) => {
          if (!cancelled) setOpenQuestions(openCount);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [isOwnCompany])
  );

  // Firma akışı yalnızca sekmesi açılınca çekiliyor.
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsFailed, setPostsFailed] = useState(false);

  const loadPosts = useCallback(() => {
    if (!viewedCompanyId) return;
    setPostsLoading(true);
    setPostsFailed(false);
    fetchCompanyFeed(viewedCompanyId)
      .then(({ posts: fetched }) => setPosts(fetched))
      .catch(() => {
        setPosts([]);
        setPostsFailed(true);
      })
      .finally(() => setPostsLoading(false));
  }, [viewedCompanyId]);

  useEffect(() => {
    if (tab === 'feed' && posts === null && !postsLoading) loadPosts();
  }, [tab, posts, postsLoading, loadPosts]);

  // Makine parkı da yalnızca sekmesi açılınca çekiliyor (Faz 2, Adım 5).
  const [park, setPark] = useState<{ machines: Machine[]; capacity: CompanyCapacity; totalCount: number } | null>(null);
  const [parkLoading, setParkLoading] = useState(false);
  const [parkFailed, setParkFailed] = useState(false);

  const loadPark = useCallback(() => {
    if (!viewedCompanyId) return;
    setParkLoading(true);
    setParkFailed(false);
    fetchCompanyMachines(viewedCompanyId)
      .then(setPark)
      .catch(() => setParkFailed(true))
      .finally(() => setParkLoading(false));
  }, [viewedCompanyId]);

  // Sekme açıkken her odakta tazeleniyor: parkuru düzenleyip geri dönünce
  // güncel hali gelsin. Elde veri varsa ekranda kalır (iskelet yerine sessiz).
  useFocusEffect(
    useCallback(() => {
      if (tab === 'machines') loadPark();
    }, [tab, loadPark])
  );

  // Karşılıklı referanslar (Faz 2, Adım 7): Hakkında sekmesinde gösteriliyor.
  const [refs, setRefs] = useState<CompanyReferences | null>(null);
  const [refsLoading, setRefsLoading] = useState(false);
  const [refsFailed, setRefsFailed] = useState(false);
  const [refError, setRefError] = useState<string | null>(null);
  const [refNote, setRefNote] = useState<string | null>(null);
  const [refFormOpen, setRefFormOpen] = useState(false);
  const [refRelation, setRefRelation] = useState<ReferenceRelation>('musteri');
  const [refFormNote, setRefFormNote] = useState('');
  const [refSaving, setRefSaving] = useState(false);
  const [refBusyId, setRefBusyId] = useState<string | null>(null);
  // Doğrulama rozetine dokununca düzeylerin ne anlama geldiği açılır.
  const [verifyInfoOpen, setVerifyInfoOpen] = useState(false);

  // Firma rehberi: dernek listesinden gelen, henüz sahiplenilmemiş firma.
  // Sunucu `claimed` alanını döndürüyor; rota parametresi yalnızca yedek.
  const unclaimed = !isOwnCompany && (company?.claimed ?? route.params?.claimed ?? true) === false;
  // Firması olmayan kullanıcının sahiplenme başvurusu (bu firma için bekliyorsa bant).
  const [myClaim, setMyClaim] = useState<CompanyClaim | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!unclaimed || user?.companyId) return;
      let active = true;
      fetchMyClaim()
        .then(({ claim }) => {
          if (active) setMyClaim(claim);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [unclaimed, user?.companyId])
  );
  // Sahipsiz firmada ürün/kişi sekmeleri yok.
  const visibleTabs = unclaimed ? TABS.filter((item) => item.key !== 'products' && item.key !== 'people' && item.key !== 'machines') : TABS;
  useEffect(() => {
    if (unclaimed && (tab === 'products' || tab === 'people' || tab === 'machines')) setTab('about');
  }, [unclaimed, tab]);

  const loadReferences = useCallback(() => {
    if (!viewedCompanyId) return;
    setRefsLoading(true);
    setRefsFailed(false);
    fetchCompanyReferences(viewedCompanyId)
      .then(setRefs)
      .catch(() => setRefsFailed(true))
      .finally(() => setRefsLoading(false));
  }, [viewedCompanyId]);

  useFocusEffect(
    useCallback(() => {
      if (tab === 'about') loadReferences();
    }, [tab, loadReferences])
  );

  // Güven özeti (Faz 3, Adım 5): SESSİZ istek. Üstteki istatistik kartı da
  // bundan beslendiği için sekmeden bağımsız çekiliyor; hata olursa kart
  // gizlenir, sayılar "—" olur.
  const [trust, setTrust] = useState<CompanyTrust | null>(null);

  const loadTrust = useCallback(() => {
    if (!viewedCompanyId) return;
    fetchCompanyTrust(viewedCompanyId)
      .then(({ trust: fetched }) => setTrust(fetched))
      .catch(() => setTrust(null));
  }, [viewedCompanyId]);

  useFocusEffect(
    useCallback(() => {
      loadTrust();
    }, [loadTrust])
  );

  const products = company?.products ?? [];

  const typeGroups = useMemo(
    () =>
      PRODUCT_TYPES.map((type) => ({ type, count: products.filter((p) => p.type === type).length })).filter(
        (g) => g.count > 0
      ),
    [products]
  );

  const usageGroups = useMemo(
    () =>
      USAGES.map((u) => ({ ...u, count: products.filter((p) => p.usages?.includes(u.key)).length })).filter(
        (g) => g.count > 0
      ),
    [products]
  );

  // Tasarımdaki "Ürün Grupları" ayrı bir alan değil: firmanın ürünlerinden
  // hangi kumaş çeşitlerinin bulunduğu çıkarılıyor.
  const productGroups = useMemo(() => typeGroups.map((g) => TYPE_LABELS[g.type]).join(', '), [typeGroups]);

  const visibleProducts = useMemo(
    () =>
      products.filter(
        (p) => (!typeFilter || p.type === typeFilter) && (!usageFilter || p.usages?.includes(usageFilter))
      ),
    [products, typeFilter, usageFilter]
  );

  const toggleLike = async (post: FeedPost) => {
    const liked = post.likedByMe;
    setPosts((prev) =>
      (prev ?? []).map((p) =>
        p.id === post.id ? { ...p, likedByMe: !liked, likeCount: p.likeCount + (liked ? -1 : 1) } : p
      )
    );
    haptics.light();
    try {
      await (liked ? unlikePost(post.id) : likePost(post.id));
      markFeedStale();
    } catch {
      // Sunucu reddederse eski haline dönülür.
      setPosts((prev) =>
        (prev ?? []).map((p) =>
          p.id === post.id ? { ...p, likedByMe: liked, likeCount: p.likeCount + (liked ? 1 : -1) } : p
        )
      );
      haptics.error();
    }
  };

  const removePost = async (post: FeedPost) => {
    const confirmed = await confirmAction({
      title: 'Gönderiyi sil',
      message: 'Bu gönderi kalıcı olarak silinsin mi?',
      confirmLabel: 'Sil',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deletePost(post.id);
      haptics.success();
      setPosts((prev) => (prev ?? []).filter((p) => p.id !== post.id));
      markFeedStale();
    } catch {
      haptics.error();
    }
  };

  const sharePost = (post: FeedPost) => {
    const author = `${post.author.firstName} ${post.author.lastName}`;
    Share.share({ message: `${author} (Takyon):\n\n${post.body}` }).catch(() => {});
  };

  const submitReference = async () => {
    if (!viewedCompanyId) return;
    setRefSaving(true);
    setRefError(null);
    setRefNote(null);
    try {
      await createReference({
        toCompanyId: viewedCompanyId,
        relation: refRelation,
        note: refFormNote.trim() || undefined,
      });
      haptics.success();
      setRefFormOpen(false);
      setRefFormNote('');
      setRefNote('Onay isteği gönderildi; karşı firma onaylayınca iki sayfada da görünür.');
      loadReferences();
    } catch (err) {
      haptics.error();
      setRefError(referenceErrorMessage(err));
    } finally {
      setRefSaving(false);
    }
  };

  const respondReference = async (row: CompanyReference, action: 'confirm' | 'reject') => {
    setRefBusyId(row.id);
    setRefError(null);
    setRefNote(null);
    try {
      await respondToReference(row.id, action);
      haptics.success();
      setRefNote(
        action === 'confirm'
          ? `${row.company.name} referanslarınızda görünüyor.`
          : `${row.company.name} isteği reddedildi.`
      );
      loadReferences();
    } catch (err) {
      haptics.error();
      setRefError(referenceErrorMessage(err));
    } finally {
      setRefBusyId(null);
    }
  };

  const removeReference = async (row: CompanyReference, mode: 'withdraw' | 'remove') => {
    const confirmed = await confirmAction({
      title: mode === 'withdraw' ? 'İsteği geri çek' : 'Referansı kaldır',
      message:
        mode === 'withdraw'
          ? `${row.company.name} firmasına gönderdiğiniz onay isteği geri çekilsin mi?`
          : `${row.company.name} referansınızdan kaldırılsın mı? İki firmanın sayfasından da düşer.`,
      confirmLabel: mode === 'withdraw' ? 'Geri çek' : 'Kaldır',
      destructive: true,
    });
    if (!confirmed) return;
    setRefBusyId(row.id);
    setRefError(null);
    setRefNote(null);
    try {
      await deleteReference(row.id);
      haptics.success();
      loadReferences();
    } catch (err) {
      haptics.error();
      setRefError(referenceErrorMessage(err));
    } finally {
      setRefBusyId(null);
    }
  };

  // "Bağlantı kur": referans formunu Hakkında sekmesinde açar (firmalar
  // arasında ilişki kurmanın mevcut yolu).
  const openReferenceForm = () => {
    haptics.selection();
    setRefError(null);
    setRefNote(null);
    setRefFormOpen(true);
    setTab('about');
  };

  const bar = (title: string, actions?: React.ComponentProps<typeof AppBar>['actions']) => (
    <AppBar title={title} leading="back" onBack={() => navigation.goBack()} actions={actions} />
  );

  if (!viewedCompanyId) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar('Firma')}
        <Screen>
          <EmptyState
            icon="business-outline"
            title="Firmaya bağlı değilsiniz"
            description="Bireysel hesabınız bir firmaya bağlı değil."
          />
        </Screen>
      </View>
    );
  }

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar('Firma')}
        <Screen>
          <View style={{ flexDirection: 'row', gap: t.space[3], alignItems: 'center' }}>
            <Skeleton width={t.size.tabbar} height={t.size.tabbar} />
            <View style={{ flex: 1, gap: t.space[2] }}>
              <Skeleton width="70%" height={t.space[6]} />
              <Skeleton width="45%" height={t.space[4]} />
            </View>
          </View>
          <Skeleton height={t.size.control} />
          <Skeleton height={t.size.quickAction} />
          <SkeletonRow />
          <SkeletonRow />
        </Screen>
      </View>
    );
  }

  if (!company) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
        {bar('Firma')}
        <Screen>
          {error && !isNotFound(error) ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="Firma bilgisi alınamadı"
              description={friendlyMessage(error, 'Bağlantınızı kontrol edip tekrar deneyin.')}
              actionLabel="Tekrar dene"
              onAction={reload}
            />
          ) : (
            <EmptyState
              icon="business-outline"
              title="Firma bulunamadı"
              description="Firma kaldırılmış olabilir."
            />
          )}
        </Screen>
      </View>
    );
  }

  const people = company.users;

  const shareCompany = () => {
    Share.share({ message: `${company.name} (Takyon)` }).catch(() => {});
  };

  const appBar = bar(
    'Firma',
    isOwnCompany
      ? [
          {
            icon: 'create-outline' as const,
            label: 'Firmayı düzenle',
            onPress: () => navigation.navigate('EditCompany', { companyId: company.id }),
          },
          { icon: 'share' as const, label: 'Firmayı paylaş', onPress: shareCompany },
        ]
      : [{ icon: 'share' as const, label: 'Firmayı paylaş', onPress: shareCompany }]
  );

  // Kendi firmasında: sayfanın ne kadarının dolduğu ve eksikse "Tamamla" kartı.
  const setup = isOwnCompany
    ? companyCompleteness({
        about: company.about,
        companyType: company.companyType,
        contactEmail: company.contactEmail,
        contactPhone: company.contactPhone,
        city: company.city,
        logoUpdatedAt: company.logoUpdatedAt,
        officePhotoCount: company.officePhotoCount,
        productCount: products.length,
      })
    : null;

  const setupBanner =
    setup && setup.percent < 100 ? (
      <Card>
        <View style={{ gap: t.space[2] }}>
          <Text style={[t.type.body16Strong, { color: t.colors.ink }]}>
            Firma sayfanız %{setup.percent} tamamlandı
          </Text>
          <View
            style={{
              height: t.space[1] + 2,
              borderRadius: t.radius.sm,
              backgroundColor: t.colors.surface2,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                height: '100%',
                width: `${setup.percent}%`,
                borderRadius: t.radius.sm,
                backgroundColor: t.colors.brand,
              }}
            />
          </View>
          <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
            {setup.total - setup.doneCount} adım kaldı. Eksik bilgiler alıcıların size güvenmesini zorlaştırır.
          </Text>
          <Button
            kind="secondary"
            label="Tamamla"
            onPress={() => navigation.navigate('CompanySetup')}
            accessibilityLabel={`Firma sayfanız yüzde ${setup.percent} tamamlandı, tamamla`}
          />
        </View>
      </Card>
    ) : null;

  // Kimlik: 64px logo karesi, ad, doğrulama rozeti, iki bilgi satırı.
  const infoLine1 = [
    company.companyType ? companyTypeLabel(company.companyType) : '',
    productGroups,
    [company.district, company.city].filter(Boolean).join(', '),
  ]
    .filter(Boolean)
    .join(' · ');

  const infoLine2 = [
    company.foundedYear ? `Kuruluş ${company.foundedYear}` : '',
    company.mainMarkets,
  ]
    .filter(Boolean)
    .join(' · ');

  const identity = (
    <View style={{ gap: t.space[3] }}>
      <View style={{ flexDirection: 'row', gap: t.space[3], alignItems: 'flex-start', minWidth: 0 }}>
        <CompanyLogo name={company.name} companyId={company.id} logoUpdatedAt={company.logoUpdatedAt} />
        <View style={{ flex: 1, minWidth: 0, gap: t.space[2] }}>
          <Text style={[t.type.title22, { color: t.colors.ink }]}>{company.name}</Text>
          {company.verification === 'dogrulanmis' ? (
            <Pressable
              onPress={() => setVerifyInfoOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityState={{ expanded: verifyInfoOpen }}
              accessibilityLabel={`${verificationLevelText(company)}. Doğrulama düzeyleri ne demek?`}
              style={({ pressed }) => [{ alignSelf: 'flex-start', opacity: pressed ? 0.6 : 1 }]}
            >
              <Badge kind="verified" />
            </Pressable>
          ) : company.verification === 'inceleniyor' ? (
            <Badge kind="pending" label="İnceleniyor" />
          ) : (
            <Badge kind="info" label="Doğrulanmamış" />
          )}
          {infoLine1 ? <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{infoLine1}</Text> : null}
          {infoLine2 ? <Text style={[t.type.body14, { color: t.colors.ink2 }]}>{infoLine2}</Text> : null}
          {verifyInfoOpen && company.verification === 'dogrulanmis' ? (
            <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
              {verificationLevelText(company)}. Belge ile doğrulama: firmanın vergi levhası ve ticaret sicil kaydı
              incelendi. Yerinde ziyaretle doğrulama: Takyon ekibi tesisi yerinde gördü.
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );

  // WhatsApp yalnızca firmanın kayıtlı iletişim telefonu (contactPhone) varsa.
  // Kullanıcıların kişisel telefonu gizli, burada kullanılmaz. wa.me ülke
  // koduyla ister: "0532…" / "532…" → "90532…"; geçersiz numarada düğme yok.
  const whatsappPhone = toWhatsappNumber(company.contactPhone);

  // Eylem sırası: tek dolu düğme + kenarlıklı düğme + 48px kare ikon düğmesi.
  const claimPending = !!myClaim && myClaim.companyId === company.id && myClaim.status === 'pending';
  const unclaimedBlock = (
    <View style={{ gap: t.space[3] }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: t.space[2],
          padding: t.space[3],
          borderRadius: t.radius.md,
          backgroundColor: t.colors.brandSoft,
          minWidth: 0,
        }}
      >
        <Icon name="info" size={t.size.iconSm} color="brand" />
        <Text style={[t.type.body14, { color: t.colors.ink, flex: 1, minWidth: 0 }]}>
          Bu firma dernek listesinden eklendi, henüz Takyon'a katılmadı.
        </Text>
      </View>
      {claimPending ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.space[2],
            padding: t.space[3],
            borderRadius: t.radius.md,
            backgroundColor: t.colors.warningSoft,
            minWidth: 0,
          }}
        >
          <Icon name="clock" size={t.size.iconSm} color="warning" />
          <Text style={[t.type.body14, { color: t.colors.ink, flex: 1, minWidth: 0 }]}>
            Başvurunuz inceleniyor. Sonuç bildirimle gelecek.
          </Text>
        </View>
      ) : !user?.companyId ? (
        <Button
          label="Bu firma benim"
          icon="shield-checkmark-outline"
          onPress={() => navigation.navigate('ClaimCompany', { companyId: company.id, companyName: company.name })}
          fullWidth
        />
      ) : null}
      <Button
        kind="secondary"
        label="Bu firmayı davet et"
        icon="person-add-outline"
        onPress={() => navigation.navigate('Invites')}
        fullWidth
      />
    </View>
  );

  const actionRow = unclaimed ? unclaimedBlock : isOwnCompany ? (
    <View style={{ flexDirection: 'row', gap: t.space[2], alignItems: 'center' }}>
      <Button label="Ürün ekle" icon="plus" onPress={() => navigation.navigate('AddProduct')} style={{ flex: 1 }} />
      <Button
        kind="secondary"
        label="Talepler"
        icon="requests"
        onPress={() => navigation.navigate('IncomingSampleRequests')}
        style={{ flex: 1 }}
      />
    </View>
  ) : (
    // Mesaj gönder + WhatsApp (telefon varsa) + bağlantı kur kare düğmesi.
    // Metinler kısaltılmaz: dar ekranda iki düğme alt alta iner, kare düğme yanda kalır.
    <View style={{ flexDirection: 'row', gap: t.space[2], alignItems: 'center' }}>
      <ButtonRow style={{ flex: 1, minWidth: 0 }}>
        <Button label="Mesaj gönder" icon="message" onPress={() => navigation.navigate('NewConversation')} />
        {whatsappPhone ? (
          <Button
            kind="secondary"
            label="WhatsApp"
            icon="whatsapp"
            accessibilityLabel={`${company.name} ile WhatsApp'ta yazış`}
            onPress={() => Linking.openURL(`https://wa.me/${whatsappPhone}`).catch(() => {})}
          />
        ) : null}
      </ButtonRow>
      {user?.companyId ? (
        <SquareButton icon="person-add-outline" label="Bağlantı kur" onPress={openReferenceForm} />
      ) : null}
    </View>
  );

  // Değeri olmayan ("—") kutular gizlenir (tasarım incelemesi 2026-09-23).
  const responseTime = responseTimeText(trust?.quoteResponse?.medianHours ?? null);
  const stats: { value: string | number; label: string }[] = [
    { value: products.length, label: 'Ürün' },
    ...(trust?.quoteResponse ? [{ value: `%${trust.quoteResponse.responseRate}`, label: 'Numune yanıtı' }] : []),
    ...(responseTime ? [{ value: responseTime, label: 'Ort. yanıt' }] : []),
    ...(trust?.confirmedReferenceCount != null
      ? [{ value: trust.confirmedReferenceCount, label: 'Ortak bağlantı' }]
      : []),
  ];

  const statsCard = (
    <Card>
      <View style={{ flexDirection: 'row', gap: t.space[2], minWidth: 0 }}>
        {stats.map((item) => (
          <StatBox key={item.label} value={item.value} label={item.label} />
        ))}
      </View>
    </Card>
  );

  // Sekme şeridi: aktif label-14 brand + 2px brand alt çizgi, pasif ink-3.
  const tabStrip = (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      data={visibleTabs}
      keyExtractor={(item) => item.key}
      style={{ borderBottomWidth: 1, borderBottomColor: t.colors.line, flexGrow: 0 }}
      contentContainerStyle={{ gap: t.space[4] }}
      renderItem={({ item }) => {
        const selected = tab === item.key;
        const count =
          item.key === 'products'
            ? products.length
            : item.key === 'people'
              ? people.length
              : item.key === 'machines'
                ? park?.totalCount
                : undefined;
        return (
          <Pressable
            onPress={() => {
              haptics.selection();
              setTab(item.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={count === undefined ? item.label : `${item.label}, ${count}`}
            style={({ pressed }) => [
              {
                minHeight: t.size.touchMin,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: t.space[1],
                borderBottomWidth: 2,
                borderBottomColor: selected ? t.colors.brand : 'transparent',
                opacity: pressed && !selected ? 0.6 : 1,
              },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[t.type.label14, { color: selected ? t.colors.brand : t.colors.ink3 }]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      }}
    />
  );

  // --- Referanslar bölümü (Hakkında) ------------------------------------
  const confirmedCustomers = (refs?.references ?? []).filter((r) => r.relation === 'musteri');
  const confirmedSuppliers = (refs?.references ?? []).filter((r) => r.relation === 'tedarikci');

  const referenceRow = (row: CompanyReference, divider: boolean, action?: React.ReactNode, detail?: string) => (
    <View key={row.id} style={{ gap: t.space[2] }}>
      <ListRow
        title={row.company.name}
        subtitle={[row.company.city, detail, row.note].filter(Boolean).join(' · ') || undefined}
        avatarName={row.company.name}
        avatarKind="company"
        right={row.company.verification === 'dogrulanmis' ? <Icon name="check" size={t.size.iconSm} color="success" /> : undefined}
        divider={divider}
        onPress={() => navigation.push('CompanyProfile', { companyId: row.company.id })}
      />
      {action}
    </View>
  );

  // Onaylı referansı iki taraf da kaldırabilir; kendi sayfanızda düğme çıkar.
  const removeButton = (row: CompanyReference) =>
    isOwnCompany ? (
      <Button
        kind="danger"
        label="Kaldır"
        onPress={() => void removeReference(row, 'remove')}
        disabled={refBusyId === row.id}
        accessibilityLabel={`Referansı kaldır: ${row.company.name}`}
      />
    ) : undefined;

  const referencesContent = (
    <View style={{ gap: t.space[4] }}>
      {trust ? <TrustSummaryCard trust={trust} /> : null}

      <SectionTitle title="Referanslar" />

      {refsLoading && !refs ? (
        <Card>
          <SkeletonRow />
          <SkeletonRow />
        </Card>
      ) : null}

      {refsFailed && !refs ? (
        <Card>
          <EmptyState
            icon="cloud-offline-outline"
            title="Referanslar alınamadı"
            description="Bağlantınızı kontrol edip tekrar deneyin."
            actionLabel="Tekrar dene"
            onAction={loadReferences}
          />
        </Card>
      ) : null}

      {refError ? <Text style={[t.type.body14, { color: t.colors.danger }]}>{refError}</Text> : null}
      {refNote ? <Text style={[t.type.body14, { color: t.colors.success }]}>{refNote}</Text> : null}

      {refs ? (
        <>
          {isOwnCompany && refs.pendingIncoming.length ? (
            <>
              <SectionTitle title={`Onayınızı bekleyenler (${refs.pendingIncoming.length})`} />
              <Card>
                {refs.pendingIncoming.map((row, index) =>
                  referenceRow(
                    row,
                    index < refs.pendingIncoming.length - 1,
                    <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                      <Button
                        kind="secondary"
                        label="Onayla"
                        onPress={() => void respondReference(row, 'confirm')}
                        disabled={refBusyId === row.id}
                        accessibilityLabel={`${row.company.name} referansını onayla`}
                        style={{ flex: 1 }}
                      />
                      <Button
                        kind="danger"
                        label="Reddet"
                        onPress={() => void respondReference(row, 'reject')}
                        disabled={refBusyId === row.id}
                        accessibilityLabel={`${row.company.name} referansını reddet`}
                        style={{ flex: 1 }}
                      />
                    </View>,
                    // relation sayfası görüntülenen firmaya (size) göre.
                    `${row.company.name} sizi ${row.relation === 'tedarikci' ? 'müşterisi' : 'tedarikçisi'} olarak gösterdi.`
                  )
                )}
              </Card>
              <Text style={[t.type.body14, { color: t.colors.ink2 }]}>
                Onayladığınız referans iki firmanın sayfasında da görünür; reddettiğiniz hiçbir yerde görünmez.
              </Text>
            </>
          ) : null}

          {isOwnCompany && refs.pendingOutgoing.length ? (
            <>
              <SectionTitle title={`Gönderdikleriniz — onay bekliyor (${refs.pendingOutgoing.length})`} />
              <Card>
                {refs.pendingOutgoing.map((row, index) =>
                  referenceRow(
                    row,
                    index < refs.pendingOutgoing.length - 1,
                    <Button
                      kind="secondary"
                      label="İsteği geri çek"
                      onPress={() => void removeReference(row, 'withdraw')}
                      disabled={refBusyId === row.id}
                      accessibilityLabel={`${row.company.name} firmasına gönderdiğiniz isteği geri çek`}
                    />,
                    `Bu firmayı ${row.relation === 'musteri' ? 'müşteriniz' : 'tedarikçiniz'} olarak gösterdiniz.`
                  )
                )}
              </Card>
            </>
          ) : null}

          {confirmedCustomers.length ? (
            <>
              <SectionTitle
                title={`${isOwnCompany ? 'Müşterileriniz' : 'Müşterileri'} (${confirmedCustomers.length})`}
              />
              <Card>
                {confirmedCustomers.map((row, index) =>
                  referenceRow(row, index < confirmedCustomers.length - 1, removeButton(row))
                )}
              </Card>
            </>
          ) : null}

          {confirmedSuppliers.length ? (
            <>
              <SectionTitle
                title={`${isOwnCompany ? 'Tedarikçileriniz' : 'Tedarikçileri'} (${confirmedSuppliers.length})`}
              />
              <Card>
                {confirmedSuppliers.map((row, index) =>
                  referenceRow(row, index < confirmedSuppliers.length - 1, removeButton(row))
                )}
              </Card>
            </>
          ) : null}

          {refs.references.length === 0 ? (
            <Card>
              <EmptyState
                icon="ribbon-outline"
                title="Henüz onaylı referans yok"
                description={
                  isOwnCompany
                    ? "Çalıştığınız firmaların sayfasından 'Bağlantı kur' diyerek onay isteyebilirsiniz."
                    : 'Bu firmanın onaylı referansı yok.'
                }
              />
            </Card>
          ) : null}

          {/* Başkasının sayfası ve firmanız varsa: referans olarak ekleme formu. */}
          {!isOwnCompany && user?.companyId ? (
            <Card>
              {refFormOpen ? (
                <View style={{ gap: t.space[3] }}>
                  <Text style={[t.type.title18, { color: t.colors.ink }]}>Bu firmayla çalışıyor musunuz?</Text>
                  <View style={{ flexDirection: 'row', gap: t.space[2], flexWrap: 'wrap' }}>
                    <Chip
                      label="Bu firma müşterimiz"
                      selected={refRelation === 'musteri'}
                      onPress={() => {
                        haptics.selection();
                        setRefRelation('musteri');
                      }}
                    />
                    <Chip
                      label="Bu firma tedarikçimiz"
                      selected={refRelation === 'tedarikci'}
                      onPress={() => {
                        haptics.selection();
                        setRefRelation('tedarikci');
                      }}
                    />
                  </View>
                  <Input
                    label="Not (isteğe bağlı)"
                    value={refFormNote}
                    onChangeText={setRefFormNote}
                    placeholder="Örn. 2023'ten beri süprem alıyoruz"
                    maxLength={200}
                    multiline
                    helper="İstek karşı firmaya gider; onaylanmadan hiçbir sayfada görünmez."
                  />
                  <View style={{ flexDirection: 'row', gap: t.space[2] }}>
                    <Button
                      kind="secondary"
                      label="Gönder"
                      loading={refSaving}
                      onPress={() => void submitReference()}
                      style={{ flex: 1 }}
                    />
                    <Button
                      kind="quiet"
                      label="Vazgeç"
                      disabled={refSaving}
                      onPress={() => {
                        setRefFormOpen(false);
                        setRefError(null);
                      }}
                      style={{ flex: 1 }}
                    />
                  </View>
                </View>
              ) : (
                <Button
                  kind="secondary"
                  label="Referans olarak ekle"
                  icon="person-add-outline"
                  onPress={openReferenceForm}
                  accessibilityLabel={`${company.name} firmasını referans olarak ekle`}
                />
              )}
            </Card>
          ) : null}
        </>
      ) : null}
    </View>
  );

  // --- Hakkında sekmesi --------------------------------------------------
  const ownTools = isOwnCompany ? (
    <>
      <SectionTitle title="Firma yönetimi" />
      <Card noPadding style={{ paddingHorizontal: t.space[4] }}>
        {pendingDrafts > 0 ? (
          <ListRow
            title={`WhatsApp taslakları (${pendingDrafts})`}
            subtitle="Etiket fotoğrafından hazırlandı, kontrol edip kaydedin"
            left={<Icon name="whatsapp" color="brand" />}
            onPress={() => navigation.navigate('ProductDrafts')}
          />
        ) : null}
        <ListRow
          title="İplik ekle"
          subtitle="İplikler kumaş formuyla değil kendi formuyla eklenir"
          left={<Icon name="yarn" color="brand" />}
          onPress={() => navigation.navigate('YarnForm')}
        />
        <ListRow
          title={openQuoteRequests ? `Gelen teklif istekleri (${openQuoteRequests})` : 'Gelen teklif istekleri'}
          left={<Icon name="quote" color="brand" />}
          onPress={() => navigation.navigate('QuoteRequests', { role: 'seller' })}
        />
        <ListRow
          title={pendingDealReviews ? `Siparişler (${pendingDealReviews} değerlendirme bekliyor)` : 'Siparişler'}
          left={<Icon name="sample" color="brand" />}
          onPress={() => navigation.navigate('Deals', { role: 'seller' })}
        />
        <ListRow
          title={openQuestions ? `Asistana gelen sorular (${openQuestions})` : 'Asistana gelen sorular'}
          left={<Icon name="sparkles-outline" color="brand" />}
          onPress={() => navigation.navigate('CompanyQuestions')}
        />
        <ListRow
          title="Tedarikçi ya da müşteri davet et"
          left={<Icon name="person-add-outline" color="brand" />}
          onPress={() => navigation.navigate('Invites')}
        />
        <ListRow
          title="Firmayı düzenle"
          left={<Icon name="create-outline" color="brand" />}
          divider={false}
          onPress={() => navigation.navigate('EditCompany', { companyId: company.id })}
        />
      </Card>
    </>
  ) : null;

  // Bilgi satırı (ürün detayındaki özellik tablosuyla aynı): etiket body-16
  // ink-2 normal, değer ink. Boş değer "Eklenmemiş" (ink-3).
  const factRow = (label: string, value: string | null | undefined, mono?: boolean, onPress?: () => void) => {
    const empty = !value || value === '—';
    const row = (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[3],
          minHeight: t.size.row,
          paddingVertical: t.space[2],
          borderBottomWidth: 1,
          borderBottomColor: t.colors.line,
        }}
      >
        <Text style={[t.type.body16, { color: t.colors.ink2 }]}>{label}</Text>
        <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end' }}>
          <Text
            style={[
              mono && !empty ? t.type.mono14 : t.type.body16,
              { color: empty ? t.colors.ink3 : t.colors.ink, textAlign: 'right' },
            ]}
          >
            {empty ? 'Eklenmemiş' : value}
          </Text>
        </View>
        {onPress ? <Icon name="chevron" color="ink3" /> : null}
      </View>
    );
    return onPress ? (
      <Pressable
        key={label}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${empty ? 'Eklenmemiş' : value}`}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        {row}
      </Pressable>
    ) : (
      <View key={label}>{row}</View>
    );
  };

  const aboutContent = (
    <View style={{ gap: t.space[4] }}>
      {route.params?.focus === 'references' ? referencesContent : null}

      <SectionTitle title="Hakkında" />
      <Card>
        {company.about ? (
          <Text style={[t.type.body16, { color: t.colors.ink }]}>{company.about}</Text>
        ) : isOwnCompany ? (
          <Pressable
            onPress={() => navigation.navigate('CompanySetup', { step: 'tanitim' })}
            accessibilityRole="button"
            accessibilityLabel="Firmanızı tanıtan bir yazı ekleyin"
            style={({ pressed }) => [{ minHeight: t.size.touchMin, justifyContent: 'center', opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[t.type.body16, { color: t.colors.ink2 }]}>
              Firmanızı tanıtan bir yazı ekleyin: ne ürettiğiniz, kapasiteniz ve öne çıkan özellikleriniz.
            </Text>
            <Text style={[t.type.label14, { color: t.colors.brand }]}>Tanıtım yazısı ekle</Text>
          </Pressable>
        ) : (
          <Text style={[t.type.body16, { color: t.colors.ink2 }]}>Bu firma henüz tanıtım yazısı eklememiş.</Text>
        )}
      </Card>

      <SectionTitle title="İletişim" />
      <Card noPadding style={{ paddingHorizontal: t.space[4] }}>
        {factRow('E-posta', company.contactEmail || '—')}
        {factRow('Telefon', company.contactPhone || '—', true)}
        {company.website ? (
          <ListRow
            title="Web sitesi"
            subtitle={company.website}
            left={null}
            onPress={() => Linking.openURL(websiteUrl(company.website)).catch(() => {})}
          />
        ) : null}
        {company.address || company.city || company.district
          ? factRow(
              'Adres',
              [company.address, [company.district, company.city].filter(Boolean).join('/')].filter(Boolean).join(', ')
            )
          : null}
        {/* Vergi numarası hiç gösterilmez; yalnızca doğrulanmış firmada onay satırı. */}
        {company.verification === 'dogrulanmis' ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.space[3],
              minHeight: t.size.row,
              borderBottomWidth: 1,
              borderBottomColor: t.colors.line,
            }}
          >
            <Text style={[t.type.body16, { color: t.colors.ink2, flex: 1, minWidth: 0 }]}>Vergi kaydı doğrulandı</Text>
            <Icon name="checkmark-circle-outline" color="success" />
          </View>
        ) : null}
        {isOwnCompany ? factRow('Şirket kodu', company.companyCode, true) : null}
      </Card>

      <SectionTitle title="Şirket genel bakışı" />
      <Card noPadding style={{ paddingHorizontal: t.space[4] }}>
        {factRow('Şirket tipi', company.companyType ? companyTypeLabel(company.companyType) : '—')}
        {factRow('Kuruluş yılı', company.foundedYear ? String(company.foundedYear) : '—', true)}
        {factRow('Ürün grupları', productGroups || '—')}
        {factRow('Şehir', [company.district, company.city].filter(Boolean).join('/') || '—')}
        {factRow('Ana pazarlar', company.mainMarkets || '—')}
        {factRow(
          'Doğrulama',
          company.verification === 'dogrulanmis'
            ? 'Doğrulanmış üretici'
            : company.verification === 'inceleniyor'
              ? 'İnceleniyor'
              : 'Doğrulanmamış',
          false,
          isOwnCompany ? () => navigation.navigate('Verification') : undefined
        )}
      </Card>

      {ownTools}

      {route.params?.focus === 'references' ? null : referencesContent}
    </View>
  );

  // --- Belgeler sekmesi (sertifikalar + firma görselleri) ----------------
  const docsContent = (
    <View style={{ gap: t.space[4] }}>
      {company.certificatePhotoCount ? (
        <>
          <SectionTitle title={`Sertifikalar ve başarılar (${company.certificatePhotoCount})`} />
          <CompanyPhotoGallery
            companyId={company.id}
            kind="certificate"
            count={company.certificatePhotoCount}
            itemLabel="Sertifika"
          />
        </>
      ) : null}

      {company.officePhotoCount ? (
        <>
          <SectionTitle title={`Firmadan görseller (${company.officePhotoCount})`} />
          <CompanyPhotoGallery
            companyId={company.id}
            kind="office"
            count={company.officePhotoCount}
            itemLabel="Firma fotoğrafı"
          />
        </>
      ) : null}

      {!company.certificatePhotoCount && !company.officePhotoCount ? (
        <Card>
          <EmptyState
            icon="document-text-outline"
            title={isOwnCompany ? 'Henüz belge eklemediniz' : 'Belge yok'}
            description={
              isOwnCompany
                ? 'Sertifikalarınızı ve firma görsellerinizi ekleyin; alıcılar size daha çabuk güvenir.'
                : 'Bu firma sertifika ya da görsel eklememiş.'
            }
            actionLabel={isOwnCompany ? 'Firmayı düzenle' : undefined}
            onAction={isOwnCompany ? () => navigation.navigate('EditCompany', { companyId: company.id }) : undefined}
          />
        </Card>
      ) : null}
    </View>
  );

  // --- Makineler sekmesi ------------------------------------------------
  // Varsayılan görünüm firmanın parkur tablosu gibi bir TABLO (MachineParkView →
  // MachineTable); "Kart" seçilirse eski makine kartları. Sahibi satıra dokununca
  // düzenler, Durum hücresine dokununca alt sayfadan müsaitliği günceller.
  const capacityTons = monthlyCapacityText(park?.capacity.monthlyCapacityTons ?? null);
  const updateParkMachine = (updated: Machine) =>
    setPark((prev) =>
      prev ? { ...prev, machines: prev.machines.map((m) => (m.id === updated.id ? updated : m)) } : prev
    );

  const machinesContent = (
    <View style={{ gap: t.space[3] }}>
      {parkLoading && !park ? (
        <Card>
          <SkeletonRow />
          <SkeletonRow />
        </Card>
      ) : null}
      {parkFailed && !park ? (
        <Card>
          <EmptyState
            icon="cloud-offline-outline"
            title="Makineler alınamadı"
            description="Bağlantınızı kontrol edip tekrar deneyin."
            actionLabel="Tekrar dene"
            onAction={loadPark}
          />
        </Card>
      ) : null}

      {park ? (
        <>
          {isOwnCompany && park.machines.length ? (
            <ButtonRow>
              <Button kind="secondary" label="Makine ekle" icon="plus" onPress={() => navigation.navigate('MachineForm')} />
              <Button kind="secondary" label="Fotoğraftan aktar" icon="camera-outline" onPress={() => navigation.navigate('MachineImport')} />
              <Button
                kind="secondary"
                label="Kapasite"
                icon="create-outline"
                accessibilityLabel="Aylık kapasiteyi ve makine listesini düzenle"
                onPress={() => navigation.navigate('MachinePark')}
              />
            </ButtonRow>
          ) : null}

          {park.machines.length && (capacityTons || park.capacity.note) ? (
            <Card>
              <View style={{ gap: t.space[1] }}>
                <Text style={[t.type.body14, { color: t.colors.ink2 }]}>Aylık kapasite</Text>
                {capacityTons ? <Text style={[t.type.mono14, { color: t.colors.ink }]}>{capacityTons}</Text> : null}
                {park.capacity.note ? (
                  <Text style={[t.type.body16, { color: t.colors.ink }]}>{park.capacity.note}</Text>
                ) : null}
                {park.capacity.updatedAt ? (
                  <Text style={[t.type.body14, { color: t.colors.ink3 }]}>
                    güncellendi: {formatRelativeTime(park.capacity.updatedAt)}
                  </Text>
                ) : null}
              </View>
            </Card>
          ) : null}

          {park.machines.length ? (
            <MachineParkView
              machines={park.machines}
              isOwner={isOwnCompany}
              onEdit={(machine) => navigation.navigate('MachineForm', { machineId: machine.id })}
              onChanged={updateParkMachine}
            />
          ) : null}

          {!park.machines.length ? (
            <Card>
              {isOwnCompany ? (
                <View style={{ gap: t.space[2] }}>
                <EmptyState
                  icon="machine"
                  title="Makine parkurunu ekle, fason iş alan firmalar arasında görün"
                  description="Tür, çap, fine ve günlük kapasiteyi girin; fason iş arayanlar sizi aramada bulsun."
                  actionLabel="Makine ekle"
                  onAction={() => navigation.navigate('MachineForm')}
                />
                <Button
                  kind="quiet"
                  label="Tablonuzu fotoğraftan aktarın"
                  icon="camera-outline"
                  fullWidth
                  onPress={() => navigation.navigate('MachineImport')}
                />
                </View>
              ) : (
                <Text style={[t.type.body16, { color: t.colors.ink2, textAlign: 'center' }]}>
                  Bu firma henüz makine eklemedi.
                </Text>
              )}
            </Card>
          ) : null}
        </>
      ) : null}
    </View>
  );

  // --- Ürünler sekmesi ---------------------------------------------------
  const gridTitle = typeFilter ? TYPE_LABELS[typeFilter] : 'Ürünler';

  const productFilters =
    products.length > 0 ? (
      <View style={{ gap: t.space[2] }}>
        {typeGroups.length > 1 ? (
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ gap: t.space[2] }}
            data={[{ type: null as ProductType | null, count: products.length }, ...typeGroups]}
            keyExtractor={(item) => item.type ?? 'all'}
            renderItem={({ item }) => (
              <Chip
                label={`${item.type ? TYPE_LABELS[item.type] : 'Tümü'} ${item.count}`}
                selected={item.type ? typeFilter === item.type : !typeFilter}
                onPress={() => {
                  haptics.selection();
                  setTypeFilter(item.type && typeFilter !== item.type ? item.type : null);
                }}
              />
            )}
          />
        ) : null}
        {usageGroups.length > 0 ? (
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ gap: t.space[2] }}
            data={usageGroups}
            keyExtractor={(item) => item.key}
            renderItem={({ item }) => (
              <Chip
                label={`${item.label} ${item.count}`}
                selected={usageFilter === item.key}
                onPress={() => {
                  haptics.selection();
                  setUsageFilter(usageFilter === item.key ? null : item.key);
                }}
              />
            )}
          />
        ) : null}
      </View>
    ) : null;

  const peopleRows = (
    <Card noPadding style={{ paddingHorizontal: t.space[4] }}>
      {people.map((person, index) => (
        <ListRow
          key={person.id}
          title={`${person.firstName} ${person.lastName}${person.id === user?.id ? ' (siz)' : ''}`}
          subtitle={person.position}
          left={
            <UserAvatar
              userId={person.id}
              firstName={person.firstName}
              lastName={person.lastName}
              avatarUpdatedAt={person.avatarUpdatedAt}
              size={t.size.avatar}
            />
          }
          divider={index < people.length - 1}
          onPress={() => navigation.navigate('Profile', { userId: person.id })}
        />
      ))}
    </Card>
  );

  // --- Liste iskeleti ----------------------------------------------------
  const listHeader = (
    <View style={{ gap: t.space[6] }}>
      {error ? (
        <Card>
          <Text style={[t.type.body14, { color: t.colors.danger }]}>
            {friendlyMessage(error, 'Firma bilgisi alınamadı')}
          </Text>
          <Button kind="secondary" label="Tekrar dene" onPress={reload} style={{ marginTop: t.space[2] }} />
        </Card>
      ) : null}
      {setupBanner}
      {identity}
      {actionRow}
      {unclaimed ? null : statsCard}
      {tabStrip}
      {tab === 'about' ? aboutContent : null}
      {tab === 'docs' ? docsContent : null}
      {tab === 'machines' ? machinesContent : null}
      {tab === 'products' ? (
        <View style={{ gap: t.space[3] }}>
          {isOwnCompany ? (
            <ButtonRow>
              <Button kind="secondary" label="Web sitesinden aktar" icon="globe-outline" onPress={() => navigation.navigate('CatalogImport', { source: 'web' })} />
              <Button kind="secondary" label="Dosyadan aktar" icon="document-outline" onPress={() => navigation.navigate('CatalogImport', { source: 'file' })} />
            </ButtonRow>
          ) : null}
          {productFilters}
          {visibleProducts.length ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <SectionTitle title={gridTitle} />
              </View>
              <Text style={[t.type.label14, { color: t.colors.brand }]}>{visibleProducts.length} ürün</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {tab === 'people' ? <SectionTitle title="Yetkililer" /> : null}
      {tab === 'feed' && postsLoading ? (
        <Card>
          <SkeletonRow />
          <SkeletonRow />
        </Card>
      ) : null}
    </View>
  );

  const listFooter =
    tab === 'products' && people.length ? (
      <View style={{ gap: t.space[3], paddingTop: t.space[6] }}>
        <SectionTitle title="Yetkililer" />
        {peopleRows}
      </View>
    ) : null;

  const listEmpty =
    tab === 'about' || tab === 'machines' || tab === 'docs' ? null : tab === 'products' ? (
      <Card>
        <EmptyState
          icon="sample"
          title={typeFilter || usageFilter ? 'Bu süzgece uyan ürün yok' : 'Henüz ürün eklenmemiş'}
          description={
            typeFilter || usageFilter
              ? 'Süzgeci kaldırıp tüm ürünlere bakabilirsiniz.'
              : isOwnCompany
                ? 'Ürün eklediğinizde katalogda ve firma sayfanızda görünür.'
                : 'Bu firma henüz ürün eklemedi.'
          }
          actionLabel={typeFilter || usageFilter ? 'Süzgeci kaldır' : isOwnCompany ? 'Ürün ekle' : undefined}
          onAction={
            typeFilter || usageFilter
              ? () => {
                  setTypeFilter(null);
                  setUsageFilter(null);
                }
              : isOwnCompany
                ? () => navigation.navigate('AddProduct')
                : undefined
          }
        />
      </Card>
    ) : tab === 'feed' ? (
      postsLoading ? null : (
        <Card>
          <EmptyState
            icon={postsFailed ? 'cloud-offline-outline' : 'messages'}
            title={postsFailed ? 'Akış alınamadı' : 'Henüz gönderi yok'}
            description={
              postsFailed
                ? 'Bağlantınızı kontrol edip tekrar deneyin.'
                : isOwnCompany
                  ? 'Paylaştığınız gönderiler firma sayfanızda burada görünür.'
                  : 'Bu firma henüz gönderi paylaşmadı.'
            }
            actionLabel={postsFailed ? 'Tekrar dene' : isOwnCompany ? 'Gönderi paylaş' : undefined}
            onAction={postsFailed ? loadPosts : isOwnCompany ? () => navigation.navigate('CreatePost') : undefined}
          />
        </Card>
      )
    ) : (
      <Card>
        <EmptyState icon="user" title="Kişi yok" description="Bu firmaya bağlı kullanıcı yok." />
      </Card>
    );

  const data: (Product | FeedPost | CompanyEmployee)[] =
    tab === 'products' ? visibleProducts : tab === 'feed' ? posts ?? [] : tab === 'people' ? people : [];

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface0 }}>
      {appBar}
      <Screen scroll={false} contentStyle={{ flex: 1, gap: 0 }}>
        <FlatList
          // numColumns değişince FlatList yeniden kurulmalı: anahtar sekmeye bağlı.
          key={tab === 'products' ? 'grid3' : 'list1'}
          numColumns={tab === 'products' ? 3 : 1}
          columnWrapperStyle={tab === 'products' ? { gap: t.space[3] } : undefined}
          data={data as { id: string }[]}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: t.space[3], paddingBottom: bottomPad }}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl(refreshing, () => {
            refresh();
            loadTrust();
            if (tab === 'feed') loadPosts();
            if (tab === 'machines') loadPark();
          })}
          ListHeaderComponent={listHeader}
          ListHeaderComponentStyle={{ paddingBottom: t.space[4] }}
          ListFooterComponent={listFooter}
          ListEmptyComponent={listEmpty}
          renderItem={({ item }) => {
            if (tab === 'products') {
              const product = item as Product;
              return (
                <ProductTile
                  product={product}
                  onPress={() => navigation.navigate('ProductDetail', { productId: product.id })}
                />
              );
            }
            if (tab === 'feed') {
              const post = item as FeedPost;
              return (
                <PostCard
                  post={post}
                  isMine={post.author.id === user?.id}
                  myCompanyId={user?.companyId ?? null}
                  onToggleLike={toggleLike}
                  onRequestQuote={(p) =>
                    p.product &&
                    navigation.navigate('QuoteRequestForm', {
                      productId: p.product.id,
                      productCode: p.product.code,
                      stockUnit: p.product.stockUnit,
                    })
                  }
                  onOpenComments={(p) => navigation.navigate('PostComments', { postId: p.id })}
                  onOpenProduct={(p) => p.product && navigation.navigate('ProductDetail', { productId: p.product.id })}
                  onRequestSample={(p) =>
                    p.product &&
                    navigation.navigate('SampleRequestForm', { productId: p.product.id, productCode: p.product.code })
                  }
                  onOpenAuthor={(p) => navigation.navigate('Profile', { userId: p.author.id })}
                  onShare={sharePost}
                  onEdit={(p) => navigation.navigate('CreatePost', { postId: p.id })}
                  onDelete={removePost}
                />
              );
            }
            const person = item as CompanyEmployee;
            return (
              <ListRow
                title={`${person.firstName} ${person.lastName}${person.id === user?.id ? ' (siz)' : ''}`}
                subtitle={person.position}
                left={
                  <UserAvatar
                    userId={person.id}
                    firstName={person.firstName}
                    lastName={person.lastName}
                    avatarUpdatedAt={person.avatarUpdatedAt}
                    size={t.size.avatar}
                  />
                }
                onPress={() => navigation.navigate('Profile', { userId: person.id })}
              />
            );
          }}
        />
      </Screen>
    </View>
  );
}

// 48px kare ikon düğmesi (kenarlıklı): eylem sırasının üçüncü öğesi.
function SquareButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        {
          width: t.size.control,
          height: t.size.control,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: t.colors.lineStrong,
          backgroundColor: pressed ? t.colors.surface2 : t.colors.surface1,
        },
      ]}
    >
      <Icon name={icon} size={t.size.iconSm} color="ink" />
    </Pressable>
  );
}

// 64px firma logosu karesi: logo yoksa brandSoft zemin + brand baş harf.
function CompanyLogo({
  name,
  companyId,
  logoUpdatedAt,
}: {
  name: string;
  companyId: string;
  logoUpdatedAt: string | null;
}) {
  const t = useTheme();
  const key = logoUpdatedAt ? companyLogoKey(companyId, logoUpdatedAt) : null;
  const [logo, setLogo] = useState<string | null>(() => (key ? getCachedCompanyLogo(key) ?? null : null));

  useEffect(() => {
    if (!key) {
      setLogo(null);
      return;
    }
    const cached = getCachedCompanyLogo(key);
    if (cached) {
      setLogo(cached);
      return;
    }
    let cancelled = false;
    loadCompanyLogo(key)
      .then((url) => {
        if (!cancelled) setLogo(url);
      })
      .catch(() => {
        // Logo gelmezse baş harf kalır.
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const box = {
    width: t.size.tabbar,
    height: t.size.tabbar,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.line,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  };

  if (logo) {
    return (
      <View style={[box, { backgroundColor: t.colors.surface1 }]}>
        <Image
          source={{ uri: logo }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="contain"
          accessibilityLabel={`${name} logosu`}
        />
      </View>
    );
  }
  return (
    <View style={[box, { backgroundColor: t.colors.brandSoft }]}>
      <Text style={[t.type.title22, { color: t.colors.brand }]}>
        {name.trim().charAt(0).toLocaleUpperCase('tr-TR') || '?'}
      </Text>
    </View>
  );
}

// Ürün ızgarası karesi: kare kumaş görseli, altında ad ve mono ölçü satırı.
function ProductTile({ product, onPress }: { product: Product; onPress: () => void }) {
  const t = useTheme();
  const [imageUrl, setImageUrl] = useState<string | null>(() => getCachedProductImage(product.id) ?? null);

  useEffect(() => {
    if (!product.hasImage) return;
    const cached = getCachedProductImage(product.id);
    if (cached) {
      setImageUrl(cached);
      return;
    }
    let cancelled = false;
    loadProductImage(product.id)
      .then((url) => {
        if (!cancelled) setImageUrl(url);
      })
      .catch(() => {
        // Fotoğraf gelmezse yer tutucu kalır.
      });
    return () => {
      cancelled = true;
    };
  }, [product.id, product.hasImage]);

  const specs = [product.weightGsm ? `${product.weightGsm} gr` : '', product.widthCm ? `${product.widthCm} cm` : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${product.code}${specs ? `, ${specs}` : ''}`}
      style={({ pressed }) => [{ flex: 1, minWidth: 0, gap: t.space[1], opacity: pressed ? 0.7 : 1 }]}
    >
      <View
        style={{
          width: '100%',
          aspectRatio: 1,
          borderRadius: t.radius.sm,
          borderWidth: 1,
          borderColor: t.colors.line,
          backgroundColor: t.colors.surface2,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <Icon name="fabric" color="ink3" />
        )}
      </View>
      <Text numberOfLines={1} style={[t.type.body14, { color: t.colors.ink }]}>
        {product.code}
      </Text>
      {specs ? (
        <Text numberOfLines={2} style={[t.type.mono14, { color: t.colors.ink2 }]}>
          {specs}
        </Text>
      ) : null}
    </Pressable>
  );
}

// Doğrulama düzeyi (Faz 2, Adım 7): boş düzeyde yalnızca "Doğrulandı".
function verificationLevelText(company: { verificationLevel?: string; verifiedAt?: string | null }): string {
  const level =
    company.verificationLevel === 'belge'
      ? 'Belge ile doğrulandı'
      : company.verificationLevel === 'ziyaret'
        ? 'Yerinde ziyaretle doğrulandı'
        : 'Doğrulandı';
  const when = company.verifiedAt ? formatMonthYear(company.verifiedAt) : '';
  return when ? `${level} · ${when}` : level;
}

// Tipik yanıt süresi: saat/gün olarak okunur metin.
function responseTimeText(medianHours: number | null): string | null {
  if (medianHours == null) return null;
  if (medianHours >= 48) return `${Math.round(medianHours / 24)} gün`;
  if (medianHours < 1) return '<1 saat';
  return `${Math.round(medianHours)} saat`;
}

// Adres "www" ile yazıldıysa başına https:// eklenir, yoksa Linking açamaz.
function websiteUrl(website: string): string {
  const lower = website.trim().toLowerCase();
  return lower.startsWith('http://') || lower.startsWith('https://') ? website.trim() : `https://${website.trim()}`;
}

// Referans uçlarının hata kodları okunur Türkçeye çevriliyor.
function referenceErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'already_exists') {
      const status = typeof err.body?.status === 'string' ? err.body.status : '';
      if (status === 'pending') return 'Onay bekleyen bir isteğiniz var.';
      if (status === 'confirmed') return 'Bu firma zaten referansınız.';
      return 'Bu firma için daha önce bir istek gönderilmiş.';
    }
    if (err.code === 'own_company') return 'Kendi firmanızı referans olarak ekleyemezsiniz.';
    if (err.code === 'no_company') return 'Referans eklemek için bir firmaya bağlı olmanız gerekir.';
    if (err.code === 'too_many_references') return 'Referans sayısı üst sınıra ulaştı.';
    if (err.code === 'already_responded') return 'Bu istek daha önce cevaplanmış.';
    if (err.code === 'reference_not_found') return 'Bu referans artık yok, liste yenilendiğinde düşecek.';
  }
  return friendlyMessage(err, 'İşlem tamamlanamadı, tekrar deneyin.');
}

// Kayıtlı telefonu wa.me biçimine çevirir (yalnız rakam, ülke koduyla).
// Türkiye numaraları: "0532 …" → "90532…", "532 …" → "90532…". Tanınmayan
// ya da çok kısa numarada boş döner (düğme gösterilmez).
function toWhatsappNumber(phone: string | null | undefined): string {
  let digits = (phone ?? '').replace(/[^0-9]/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = `90${digits.slice(1)}`;
  else if (digits.length === 10 && digits.startsWith('5')) digits = `90${digits}`;
  return digits.length >= 11 ? digits : '';
}
