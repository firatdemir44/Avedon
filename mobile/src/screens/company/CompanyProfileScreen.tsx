import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Linking,
  Share,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
  fetchCompanyReferences,
  fetchCompanyTrust,
  fetchDeals,
  fetchQuoteRequests,
  likePost,
  respondToReference,
  unlikePost,
  type CompanyCapacity,
  type CompanyReference,
  type CompanyReferences,
  type CompanyTrust,
  type FeedPost,
  type Machine,
  type ReferenceRelation,
} from '../../api/client';
import { groupMachines, machineSummary, monthlyCapacityText } from '../../features/machines/catalog';
import { formatMonthYear, formatRelativeTime } from '../../features/time';
import { useFocusLoad } from '../../features/useFocusLoad';
import { SkeletonDetail } from '../../components/Skeleton';
import {
  EmptyState,
  ErrorState,
  InlineError,
  friendlyMessage,
  isNotFound,
} from '../../components/StateView';
import { refreshControl } from '../../components/refresh';
import { useSession } from '../../context/SessionContext';
import { PrimaryButton } from '../../components/PrimaryButton';
import { CompanyAvatar } from '../../components/CompanyAvatar';
import { ListRow } from '../../components/ListRow';
import { ProductRow } from '../../components/ProductRow';
import { SectionHeader } from '../../components/SectionHeader';
import { TrustSummaryCard } from '../../components/TrustSummaryCard';
import { ChipSelect } from '../../components/ChipSelect';
import { TextField } from '../../components/TextField';
import { CompanyPhotoGallery } from '../../components/CompanyPhotoGallery';
import { PostCard } from '../feed/PostCard';
import { confirmAction } from '../../features/confirm';
import { haptics } from '../../features/haptics';
import { markFeedStale } from '../../features/feed/feedRefresh';
import { companyCompleteness } from '../../features/companies/completeness';
import { PRODUCT_TYPES, TYPE_LABELS, USAGES, companyTypeLabel, type ProductType } from '../../features/products/catalog';
import { MIN_TOUCH, colors, fonts, radius, spacing, typography } from '../../theme';
import type { Product, VerificationStatus } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'CompanyProfile'>;

// Orijinal tasarımdaki firma sayfası dört sekmeli: Hakkında · Ürünler · Firma
// Akışı · Kişiler (docs/orijinal-tasarim/2021-ekranlar, "Firma Sayfası ...").
// Aşama B, 1. parça: sekmeler, ürün süzme çipleri, firma akışı, kişiler.
// Faz 2, Adım 5: beşinci sekme "Makine parkı" (parkur + aylık kapasite).
type CompanyTab = 'about' | 'products' | 'feed' | 'people' | 'machines';

const TABS: { key: CompanyTab; label: string }[] = [
  { key: 'about', label: 'Hakkında' },
  { key: 'products', label: 'Ürünler' },
  { key: 'feed', label: 'Akış' },
  { key: 'people', label: 'Kişiler' },
  { key: 'machines', label: 'Makine parkı' },
];

export function CompanyProfileScreen({ navigation, route }: Props) {
  const { user } = useSession();
  const viewedCompanyId = route.params?.companyId ?? user?.companyId ?? null;
  const isOwnCompany = !!user?.companyId && viewedCompanyId === user.companyId;
  const [tab, setTab] = useState<CompanyTab>(route.params?.initialTab ?? 'about');
  const [typeFilter, setTypeFilter] = useState<ProductType | null>(null);
  const [usageFilter, setUsageFilter] = useState<string | null>(null);

  // Ürün ekleyip / firmayı düzenleyip geri dönünce sayfa iskelete dönmüyor,
  // güncel bilgi sessizce geliyor.
  const { data: company, status, error, refreshing, reload, refresh } = useFocusLoad(
    () => fetchCompany(viewedCompanyId as string).then(({ company: fetched }) => fetched),
    { enabled: !!viewedCompanyId }
  );

  // Kendi firmasında: açık (henüz teklif verilmemiş) istek sayısı, düğmede
  // gösterilir. Hata sessiz: sayı görünmez, düğme yine çalışır.
  const [openQuoteRequests, setOpenQuoteRequests] = useState(0);
  // Faz 2, Adım 3: asistana gelip henüz cevaplanmamış soru sayısı (aynı desen).
  const [openQuestions, setOpenQuestions] = useState(0);
  // Faz 3, Adım 4: firmanın değerlendirme bekleyen sipariş kayıtları.
  const [pendingDealReviews, setPendingDealReviews] = useState(0);
  useFocusEffect(
    useCallback(() => {
      if (!isOwnCompany) return;
      let cancelled = false;
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

  // Karşılıklı referanslar (Faz 2, Adım 7): Hakkında sekmesinde gösteriliyor,
  // yalnızca o sekme açıkken çekiliyor ve odakta tazeleniyor.
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

  // Güven özeti (Faz 3, Adım 5): referanslar/makine parkı deseni — ayrı ve
  // SESSİZ istek, yalnızca Hakkında sekmesi açıkken. Hata olursa kart gizlenir
  // (sayfanın geri kalanı yarım kalmasın).
  const [trust, setTrust] = useState<CompanyTrust | null>(null);

  const loadTrust = useCallback(() => {
    if (!viewedCompanyId) return;
    fetchCompanyTrust(viewedCompanyId)
      .then(({ trust: fetched }) => setTrust(fetched))
      .catch(() => setTrust(null));
  }, [viewedCompanyId]);

  useFocusEffect(
    useCallback(() => {
      if (tab === 'about') loadTrust();
    }, [tab, loadTrust])
  );

  // Başlık sabit "Firmam" iken başka bir firmanın sayfasında da "Firmam"
  // yazıyordu (denetim FINDING-018).
  useEffect(() => {
    navigation.setOptions({ title: isOwnCompany ? 'Firmam' : company?.name ?? 'Firma' });
  }, [navigation, isOwnCompany, company?.name]);

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
    Share.share({ message: `${author} (Avedon):\n\n${post.body}` }).catch(() => {});
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

  if (!viewedCompanyId) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <EmptyState
          icon="business-outline"
          title="Firmaya bağlı değilsiniz"
          message="Bireysel hesabınız bir firmaya bağlı değil."
        />
      </SafeAreaView>
    );
  }

  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <SkeletonDetail variant="company" />
      </SafeAreaView>
    );
  }

  if (!company) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {error && !isNotFound(error) ? (
          <ErrorState error={error} fallback="Firma bilgisi alınamadı" onRetry={reload} />
        ) : (
          <EmptyState icon="business-outline" title="Firma bulunamadı" message="Firma kaldırılmış olabilir." />
        )}
      </SafeAreaView>
    );
  }

  const people = company.users;

  // Kendi firmasında: sayfanın ne kadarının dolduğu ve eksikse "Tamamla" şeridi.
  // Adım adım kurulum (CompanySetup) bu hesabın kendisini kullanıyor.
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
      <View style={styles.setupBanner}>
        <View style={styles.setupTexts}>
          <Text style={styles.setupTitle}>Firma sayfanız %{setup.percent} tamamlandı</Text>
          <View style={styles.setupTrack}>
            <View style={[styles.setupFill, { width: `${setup.percent}%` }]} />
          </View>
          <Text style={styles.setupHint}>
            {setup.total - setup.doneCount} adım kaldı. Eksik bilgiler alıcıların size güvenmesini zorlaştırır.
          </Text>
        </View>
        <PrimaryButton
          label="Tamamla"
          size="sm"
          onPress={() => navigation.navigate('CompanySetup')}
          accessibilityLabel={`Firma sayfanız yüzde ${setup.percent} tamamlandı, tamamla`}
        />
      </View>
    ) : null;

  const identity = (
    <View style={styles.identityBlock}>
      <View style={styles.identityRow}>
        <CompanyAvatar name={company.name} size={56} companyId={company.id} logoUpdatedAt={company.logoUpdatedAt} />
        <View style={styles.identityTexts}>
          <Text style={styles.name}>{company.name}</Text>
          <View style={styles.tagRow}>
            {company.verification === 'dogrulanmis' ? (
              // Rozete dokununca düzeylerin ne anlama geldiği açılır (Faz 2, Adım 7).
              <Pressable
                onPress={() => setVerifyInfoOpen((open) => !open)}
                accessibilityRole="button"
                accessibilityState={{ expanded: verifyInfoOpen }}
                accessibilityLabel={`${verificationLevelText(company)}. Doğrulama düzeyleri ne demek?`}
                style={({ pressed }) => [pressed && styles.linkPressed]}
              >
                <VerificationTag status={company.verification} />
              </Pressable>
            ) : (
              <VerificationTag status={company.verification} />
            )}
            <Text style={styles.taxId}>VKN {company.taxId}</Text>
          </View>
          {company.verification === 'dogrulanmis' ? (
            <Pressable
              onPress={() => setVerifyInfoOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityState={{ expanded: verifyInfoOpen }}
              style={({ pressed }) => [pressed && styles.linkPressed]}
            >
              <Text style={styles.verifyLine}>
                {verificationLevelText(company)}
                <Text style={styles.verifyHint}>{verifyInfoOpen ? '  gizle' : '  bu ne demek?'}</Text>
              </Text>
              {verifyInfoOpen ? (
                <Text style={styles.verifyInfo}>
                  Belge ile doğrulama: firmanın vergi levhası ve ticaret sicil kaydı incelendi. Yerinde ziyaretle
                  doğrulama: Avedon ekibi tesisi yerinde gördü.
                </Text>
              ) : null}
            </Pressable>
          ) : null}
        </View>
      </View>

      {isOwnCompany ? (
        <View style={styles.actions}>
          <View style={styles.actionRow}>
            <PrimaryButton
              label="Ürün Ekle"
              icon="add"
              onPress={() => navigation.navigate('AddProduct')}
              style={styles.actionButton}
            />
            {/* Faz 2, Adım 6: iplik kumaş formuyla eklenmiyor (ayrı uç ve ayrı
                alanlar), o yüzden "Ürün Ekle"nin yanında kendi düğmesi. */}
            <PrimaryButton
              label="İplik Ekle"
              icon="add"
              variant="outline"
              onPress={() => navigation.navigate('YarnForm')}
              style={styles.actionButton}
            />
          </View>
          <View style={styles.actionRow}>
            <PrimaryButton
              label="Gelen Talepler"
              variant="outline"
              onPress={() => navigation.navigate('IncomingSampleRequests')}
              style={styles.actionButton}
            />
          </View>
          {/* Faz 2, Adım 2: firmaya gelen teklif istekleri. Açık istek varsa
              sayısı düğmenin üstünde yazıyor (rozet yerine sayı: PrimaryButton
              içine ikinci bir dokunulabilir öğe koymuyoruz). */}
          <PrimaryButton
            label={openQuoteRequests ? `Gelen teklif istekleri (${openQuoteRequests})` : 'Gelen teklif istekleri'}
            variant="outline"
            icon="pricetag-outline"
            onPress={() => navigation.navigate('QuoteRequests', { role: 'seller' })}
          />
          {/* Faz 3, Adım 4: firmanın satış kayıtları. Değerlendirme bekleyen
              varsa sayısı düğmede yazıyor (teklif isteği düğmesindeki desen). */}
          <PrimaryButton
            label={pendingDealReviews ? `Siparişler (${pendingDealReviews} değerlendirme bekliyor)` : 'Siparişler'}
            variant="outline"
            icon="cube-outline"
            onPress={() => navigation.navigate('Deals', { role: 'seller' })}
          />
          {/* Faz 2, Adım 3: asistana gelen alıcı soruları. */}
          <PrimaryButton
            label={openQuestions ? `Asistana gelen sorular (${openQuestions})` : 'Asistana gelen sorular'}
            variant="outline"
            icon="sparkles-outline"
            onPress={() => navigation.navigate('CompanyQuestions')}
          />
          <PrimaryButton
            label="Firmayı Düzenle"
            variant="outline"
            icon="create-outline"
            onPress={() => navigation.navigate('EditCompany', { companyId: company.id })}
          />
        </View>
      ) : (
        // Faz 2, Adım 3: başka bir firmanın sayfasında asistanına soru sorma.
        // Asistan rengi yalnızca asistanın olduğu yerde (renk kuralı).
        <View style={styles.actions}>
          <PrimaryButton
            label="Asistana sor"
            variant="outline"
            icon="sparkles"
            onPress={() =>
              navigation.navigate('SellerAssistant', { companyId: company.id, companyName: company.name })
            }
            accessibilityLabel={`${company.name} asistanına sor`}
            tone="assistant"
          />
        </View>
      )}
    </View>
  );

  // Sekme şeridi yatay kaydırılabilir: beş sekme dar ekrana sığmıyor.
  const tabBar = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.tabBar}
      contentContainerStyle={styles.tabBarContent}
      accessibilityRole="tablist"
    >
      {TABS.map((item) => {
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
            key={item.key}
            onPress={() => {
              haptics.selection();
              setTab(item.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={count === undefined ? item.label : `${item.label}, ${count}`}
            style={({ pressed }) => [styles.tabItem, selected && styles.tabItemSelected, pressed && !selected && styles.tabPressed]}
          >
            <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]} numberOfLines={1}>
              {item.label}
              {count !== undefined ? ` (${count})` : ''}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  // Referanslar (Faz 2, Adım 7): Hakkında sekmesinin bir bölümü. Onaylılar
  // herkese, bekleyenler yalnızca kendi firmanıza görünür.
  const confirmedCustomers = (refs?.references ?? []).filter((r) => r.relation === 'musteri');
  const confirmedSuppliers = (refs?.references ?? []).filter((r) => r.relation === 'tedarikci');

  // Onaylı referansı iki taraf da kaldırabilir; kendi sayfanızda düğme çıkar.
  const removeButton = (row: CompanyReference) =>
    isOwnCompany ? (
      <Pressable
        onPress={() => void removeReference(row, 'remove')}
        accessibilityRole="button"
        accessibilityLabel={`Referansı kaldır: ${row.company.name}`}
        disabled={refBusyId === row.id}
        hitSlop={8}
        style={({ pressed }) => [styles.refRemove, pressed && styles.linkPressed]}
      >
        <Text style={styles.refRemoveText}>Kaldır</Text>
      </Pressable>
    ) : undefined;

  const referenceRow = (row: CompanyReference, divider: boolean, action?: React.ReactNode, detail?: string) => (
    <View key={row.id} style={[styles.refRow, divider && styles.refDivider]}>
      <Pressable
        onPress={() => navigation.push('CompanyProfile', { companyId: row.company.id })}
        accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
        accessibilityLabel={`${row.company.name}${row.company.city ? `, ${row.company.city}` : ''}. Firma sayfasını aç`}
        android_ripple={{ color: colors.pressed }}
        style={({ pressed }) => [styles.refTexts, pressed && styles.tabPressed]}
      >
        <View style={styles.refNameRow}>
          <Text style={styles.refName} numberOfLines={1}>
            {row.company.name}
          </Text>
          {row.company.verification === 'dogrulanmis' ? (
            <Ionicons name="checkmark-circle" size={15} color={colors.primary} />
          ) : null}
        </View>
        {row.company.city ? <Text style={styles.refCity}>{row.company.city}</Text> : null}
        {detail ? <Text style={styles.refDetail}>{detail}</Text> : null}
        {row.note ? <Text style={styles.refNote}>{row.note}</Text> : null}
      </Pressable>
      {/* Eylemler satırın YANINDA: web'de iç içe düğme olmasın. */}
      {action}
    </View>
  );

  // Güven özeti kartı Referanslar bölümünün HEMEN ÜSTÜNDE duruyor; ikisi
  // birlikte taşınsın diye aynı parçanın içindeler.
  const referencesContent = (
    <View>
      {trust ? <TrustSummaryCard trust={trust} /> : null}

      <SectionHeader title="Referanslar" count={refs?.confirmedCount} />

      {refsLoading && !refs ? (
        <View style={styles.block}>
          <ActivityIndicator style={styles.loading} color={colors.primary} />
        </View>
      ) : null}

      {refsFailed && !refs ? (
        <View style={styles.block}>
          <EmptyState
            compact
            icon="cloud-offline-outline"
            title="Referanslar alınamadı"
            message="Bağlantınızı kontrol edip tekrar deneyin."
            actionLabel="Tekrar dene"
            onAction={loadReferences}
          />
        </View>
      ) : null}

      {refError ? <InlineError message={refError} style={styles.banner} /> : null}
      {refNote ? <Text style={styles.refSuccess}>{refNote}</Text> : null}

      {refs ? (
        <>
          {/* Kendi firmanız: önce onayınızı bekleyenler, sonra gönderdikleriniz. */}
          {isOwnCompany && refs.pendingIncoming.length ? (
            <>
              <SectionHeader title="Onayınızı bekleyenler" count={refs.pendingIncoming.length} />
              <View style={styles.block}>
                {refs.pendingIncoming.map((row, index) =>
                  referenceRow(
                    row,
                    index < refs.pendingIncoming.length - 1,
                    <View style={styles.refActions}>
                      <PrimaryButton
                        label="Onayla"
                        size="sm"
                        onPress={() => void respondReference(row, 'confirm')}
                        disabled={refBusyId === row.id}
                        accessibilityLabel={`${row.company.name} referansını onayla`}
                      />
                      <PrimaryButton
                        label="Reddet"
                        size="sm"
                        variant="outline"
                        onPress={() => void respondReference(row, 'reject')}
                        disabled={refBusyId === row.id}
                        accessibilityLabel={`${row.company.name} referansını reddet`}
                      />
                    </View>,
                    // relation sayfası görüntülenen firmaya (size) göre: karşı
                    // taraf tedarikçinizse, o firma sizi müşterisi olarak gösterdi.
                    `${row.company.name} sizi ${row.relation === 'tedarikci' ? 'müşterisi' : 'tedarikçisi'} olarak gösterdi.`
                  )
                )}
              </View>
              <Text style={styles.refHint}>
                Onayladığınız referans iki firmanın sayfasında da görünür; reddettiğiniz hiçbir yerde görünmez.
              </Text>
            </>
          ) : null}

          {isOwnCompany && refs.pendingOutgoing.length ? (
            <>
              <SectionHeader title="Gönderdikleriniz — onay bekliyor" count={refs.pendingOutgoing.length} />
              <View style={styles.block}>
                {refs.pendingOutgoing.map((row, index) =>
                  referenceRow(
                    row,
                    index < refs.pendingOutgoing.length - 1,
                    <View style={styles.refActions}>
                      <PrimaryButton
                        label="İsteği geri çek"
                        size="sm"
                        variant="outline"
                        onPress={() => void removeReference(row, 'withdraw')}
                        disabled={refBusyId === row.id}
                        accessibilityLabel={`${row.company.name} firmasına gönderdiğiniz isteği geri çek`}
                      />
                    </View>,
                    `Bu firmayı ${row.relation === 'musteri' ? 'müşteriniz' : 'tedarikçiniz'} olarak gösterdiniz.`
                  )
                )}
              </View>
            </>
          ) : null}

          {confirmedCustomers.length ? (
            <>
              <SectionHeader title={isOwnCompany ? 'Müşterileriniz' : 'Müşterileri'} count={confirmedCustomers.length} />
              <View style={styles.block}>
                {confirmedCustomers.map((row, index) =>
                  referenceRow(row, index < confirmedCustomers.length - 1, removeButton(row))
                )}
              </View>
            </>
          ) : null}

          {confirmedSuppliers.length ? (
            <>
              <SectionHeader
                title={isOwnCompany ? 'Tedarikçileriniz' : 'Tedarikçileri'}
                count={confirmedSuppliers.length}
              />
              <View style={styles.block}>
                {confirmedSuppliers.map((row, index) =>
                  referenceRow(row, index < confirmedSuppliers.length - 1, removeButton(row))
                )}
              </View>
            </>
          ) : null}

          {refs.references.length === 0 ? (
            <View style={styles.block}>
              {isOwnCompany ? (
                <EmptyState
                  compact
                  icon="ribbon-outline"
                  title="Henüz onaylı referans yok"
                  message="Çalıştığınız firmaların sayfasından 'Referans olarak ekle' diyerek onay isteyebilirsiniz. Onaylanan referans iki firmanın sayfasında görünür."
                />
              ) : (
                <Text style={styles.refEmpty}>Henüz onaylı referans yok.</Text>
              )}
            </View>
          ) : null}

          {/* Başkasının sayfası ve firmanız varsa: referans olarak ekleme formu. */}
          {!isOwnCompany && user?.companyId ? (
            <View style={[styles.block, styles.refFormBlock]}>
              {refFormOpen ? (
                <>
                  <Text style={styles.refFormTitle}>Bu firmayla çalışıyor musunuz?</Text>
                  <ChipSelect
                    options={[
                      { value: 'musteri', label: 'Bu firma müşterimiz' },
                      { value: 'tedarikci', label: 'Bu firma tedarikçimiz' },
                    ]}
                    value={refRelation}
                    onChange={(next) => {
                      haptics.selection();
                      setRefRelation(next as ReferenceRelation);
                    }}
                    compact
                  />
                  <TextField
                    label="Not (isteğe bağlı)"
                    value={refFormNote}
                    onChangeText={setRefFormNote}
                    placeholder="Örn. 2023'ten beri süprem alıyoruz"
                    maxLength={200}
                    multiline
                  />
                  <Text style={styles.refHintTight}>
                    İstek karşı firmaya gider; onaylanmadan hiçbir sayfada görünmez.
                  </Text>
                  <View style={styles.refFormActions}>
                    <PrimaryButton
                      label={refSaving ? 'Gönderiliyor...' : 'Gönder'}
                      onPress={() => void submitReference()}
                      disabled={refSaving}
                      style={styles.refFormButton}
                    />
                    <PrimaryButton
                      label="Vazgeç"
                      variant="outline"
                      onPress={() => {
                        setRefFormOpen(false);
                        setRefError(null);
                      }}
                      disabled={refSaving}
                      style={styles.refFormButton}
                    />
                  </View>
                </>
              ) : (
                <PrimaryButton
                  label="Referans olarak ekle"
                  variant="outline"
                  icon="ribbon-outline"
                  onPress={() => {
                    setRefError(null);
                    setRefNote(null);
                    setRefFormOpen(true);
                  }}
                  accessibilityLabel={`${company.name} firmasını referans olarak ekle`}
                />
              )}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );

  const aboutContent = (
    <View>
      {route.params?.focus === 'references' ? referencesContent : null}
      <View style={styles.block}>
        <View style={styles.aboutBlock}>
          <Text style={styles.aboutTitle}>Hakkında</Text>
          {company.about ? (
            <Text style={styles.about}>{company.about}</Text>
          ) : isOwnCompany ? (
            // Boş durum metni doğrudan ilgili kurulum adımına götürüyor.
            <Pressable
              onPress={() => navigation.navigate('CompanySetup', { step: 'tanitim' })}
              accessibilityRole="button"
              accessibilityLabel="Firmanızı tanıtan bir yazı ekleyin"
              style={({ pressed }) => [pressed && styles.linkPressed]}
            >
              <Text style={styles.aboutEmpty}>
                Firmanızı tanıtan bir yazı ekleyin: ne ürettiğiniz, kapasiteniz ve öne çıkan özellikleriniz.
              </Text>
              <Text style={styles.aboutEmptyAction}>Tanıtım yazısı ekle</Text>
            </Pressable>
          ) : (
            <Text style={styles.aboutEmpty}>Bu firma henüz tanıtım yazısı eklememiş.</Text>
          )}
        </View>
      </View>

      <SectionHeader title="İletişim" />
      <View style={styles.block}>
        <Fact label="E-posta" value={company.contactEmail || '—'} />
        <Fact label="Telefon" value={company.contactPhone || '—'} mono />
        {company.website ? <WebsiteFact website={company.website} /> : null}
        {company.address || company.city || company.district ? (
          <Fact
            label="Adres"
            value={[company.address, [company.district, company.city].filter(Boolean).join('/')].filter(Boolean).join(', ')}
          />
        ) : null}
        <Fact label="Vergi numarası" value={company.taxId} mono />
        {isOwnCompany ? <Fact label="Şirket kodu" value={company.companyCode} mono last /> : null}
      </View>

      <SectionHeader title="Şirket genel bakışı" />
      <View style={styles.block}>
        <Fact label="Şirket tipi" value={company.companyType ? companyTypeLabel(company.companyType) : '—'} />
        <Fact label="Kuruluş yılı" value={company.foundedYear ? String(company.foundedYear) : '—'} mono />
        <Fact label="Ürün grupları" value={productGroups || '—'} />
        <Fact label="Şehir" value={[company.district, company.city].filter(Boolean).join('/') || '—'} />
        <Fact label="Ana pazarlar" value={company.mainMarkets || '—'} last />
      </View>

      {company.certificatePhotoCount ? (
        <>
          <SectionHeader title="Sertifikalar ve başarılar" count={company.certificatePhotoCount} />
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
          <SectionHeader title="Firmadan görseller" count={company.officePhotoCount} />
          <CompanyPhotoGallery
            companyId={company.id}
            kind="office"
            count={company.officePhotoCount}
            itemLabel="Firma fotoğrafı"
          />
        </>
      ) : null}

      <SectionHeader title="Özet" />
      <View style={styles.block}>
        <Fact label="Ürün sayısı" value={String(products.length)} />
        <Fact label="Kişi sayısı" value={String(people.length)} />
        <Fact
          label="Doğrulama"
          value={
            company.verification === 'dogrulanmis'
              ? 'Doğrulanmış üretici'
              : company.verification === 'inceleniyor'
                ? 'İnceleniyor'
                : 'Doğrulanmamış'
          }
          last
        />
      </View>
      {route.params?.focus === 'references' ? null : referencesContent}

      {isOwnCompany ? (
        <Text style={styles.footNote}>
          Eksik bilgileri adım adım "Tamamla" ile ya da hepsini tek seferde "Firmayı Düzenle" ile ekleyebilirsiniz.
        </Text>
      ) : null}
    </View>
  );

  const productFilters =
    products.length > 0 ? (
      <View>
        {typeGroups.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.block} contentContainerStyle={styles.chipStrip}>
            <FilterChip
              label="Tümü"
              count={products.length}
              selected={!typeFilter}
              onPress={() => setTypeFilter(null)}
            />
            {typeGroups.map((group) => (
              <FilterChip
                key={group.type}
                label={TYPE_LABELS[group.type]}
                count={group.count}
                selected={typeFilter === group.type}
                onPress={() => setTypeFilter(typeFilter === group.type ? null : group.type)}
              />
            ))}
          </ScrollView>
        ) : null}
        {usageGroups.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.block, styles.usageStripWrap]}
            contentContainerStyle={styles.chipStrip}
          >
            {usageGroups.map((group) => (
              <FilterChip
                key={group.key}
                label={group.label}
                count={group.count}
                selected={usageFilter === group.key}
                tone="usage"
                onPress={() => setUsageFilter(usageFilter === group.key ? null : group.key)}
              />
            ))}
          </ScrollView>
        ) : null}
      </View>
    ) : null;

  // Makine parkı sekmesi (Faz 2, Adım 5): üstte kapasite bloğu, altında
  // gruplara göre makine satırları. Kendi firmanda "Düzenle" yönetim ekranını
  // açar; başka firmada yalnızca okunur.
  const parkSections = groupMachines(park?.machines ?? []);
  const capacityTons = monthlyCapacityText(park?.capacity.monthlyCapacityTons ?? null);

  const machinesContent = (
    <View>
      {parkLoading && !park ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : null}
      {parkFailed && !park ? (
        <View style={styles.block}>
          <EmptyState
            compact
            icon="cloud-offline-outline"
            title="Makine parkı alınamadı"
            message="Bağlantınızı kontrol edip tekrar deneyin."
            actionLabel="Tekrar dene"
            onAction={loadPark}
          />
        </View>
      ) : null}

      {park ? (
        <>
          <View style={styles.block}>
            <View style={styles.capacityBlock}>
              <View style={styles.capacityTop}>
                <View style={styles.capacityTexts}>
                  <Text style={styles.capacityLabel}>Aylık kapasite</Text>
                  <Text style={styles.capacityValue}>{capacityTons ?? 'Bildirilmedi'}</Text>
                </View>
                <View
                  style={[
                    styles.contractTag,
                    park.capacity.contractOpen ? styles.contractTagOpen : styles.contractTagClosed,
                  ]}
                >
                  <Ionicons
                    name={park.capacity.contractOpen ? 'checkmark-circle' : 'remove-circle-outline'}
                    size={13}
                    color={park.capacity.contractOpen ? colors.success : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.contractTagText,
                      { color: park.capacity.contractOpen ? colors.success : colors.textMuted },
                    ]}
                  >
                    {park.capacity.contractOpen ? 'Fason kapasitesi açık' : 'Fason almıyor'}
                  </Text>
                </View>
              </View>
              {park.capacity.note ? <Text style={styles.capacityNote}>{park.capacity.note}</Text> : null}
              {park.capacity.updatedAt ? (
                <Text style={styles.capacityUpdated}>güncellendi: {formatRelativeTime(park.capacity.updatedAt)}</Text>
              ) : null}
              {isOwnCompany ? (
                <View style={styles.capacityAction}>
                  <PrimaryButton
                    label="Düzenle"
                    variant="outline"
                    size="sm"
                    icon="create-outline"
                    onPress={() => navigation.navigate('MachinePark')}
                    accessibilityLabel="Makine parkını ve kapasiteyi düzenle"
                  />
                </View>
              ) : null}
            </View>
          </View>

          {parkSections.length ? (
            parkSections.map((section) => (
              <View key={section.group}>
                <SectionHeader title={section.label} count={section.count} />
                <View style={styles.block}>
                  {section.items.map((machine, index) => (
                    <View
                      key={machine.id}
                      style={[styles.machineRow, index < section.items.length - 1 && styles.machineDivider]}
                    >
                      <Text style={styles.machineTitle}>
                        {machine.kind}
                        <Text style={styles.machineCount}>{`  × ${machine.count}`}</Text>
                      </Text>
                      {machineSummary(machine) ? (
                        <Text style={styles.machineSummary}>{machineSummary(machine)}</Text>
                      ) : null}
                      {machine.note ? <Text style={styles.machineNote}>{machine.note}</Text> : null}
                    </View>
                  ))}
                </View>
              </View>
            ))
          ) : (
            <View style={styles.block}>
              <EmptyState
                compact
                icon="hardware-chip-outline"
                title={isOwnCompany ? 'Makine parkınız boş' : 'Makine parkı yok'}
                message={
                  isOwnCompany
                    ? 'Makinelerinizi girdiğinizde fason iş arayanlar sizi pus, fayn ve çalışma enine göre bulabilir.'
                    : 'Bu firma makine parkını henüz girmedi.'
                }
                actionLabel={isOwnCompany ? 'Makine ekle' : undefined}
                onAction={isOwnCompany ? () => navigation.navigate('MachineForm') : undefined}
              />
            </View>
          )}
        </>
      ) : null}
    </View>
  );

  const listHeader = (
    <View>
      {error ? (
        <InlineError message={friendlyMessage(error, 'Firma bilgisi alınamadı')} onRetry={reload} style={styles.banner} />
      ) : null}
      {setupBanner}
      {identity}
      {tabBar}
      {tab === 'about' ? aboutContent : null}
      {tab === 'products' ? productFilters : null}
      {tab === 'machines' ? machinesContent : null}
      {tab === 'feed' && postsLoading ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : null}
    </View>
  );

  const data: (Product | FeedPost | { id: string; firstName: string; lastName: string; position: string })[] =
    tab === 'products' ? visibleProducts : tab === 'feed' ? posts ?? [] : tab === 'people' ? people : [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <FlatList
        data={data as { id: string }[]}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={refreshControl(refreshing, () => {
          refresh();
          if (tab === 'feed') loadPosts();
          if (tab === 'machines') loadPark();
        })}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          tab === 'about' || tab === 'machines' ? null : tab === 'products' ? (
            <View style={styles.block}>
              <EmptyState
                compact
                icon="cube-outline"
                title={typeFilter || usageFilter ? 'Bu süzgece uyan ürün yok' : 'Henüz ürün eklenmemiş'}
                message={
                  typeFilter || usageFilter
                    ? 'Süzgeci kaldırıp tüm ürünlere bakabilirsiniz.'
                    : isOwnCompany
                      ? 'Ürün eklediğinizde katalogda ve firma sayfanızda görünür.'
                      : 'Bu firma henüz ürün eklemedi.'
                }
                actionLabel={typeFilter || usageFilter ? 'Süzgeci kaldır' : isOwnCompany ? 'Ürün Ekle' : undefined}
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
            </View>
          ) : tab === 'feed' ? (
            postsLoading ? null : (
              <View style={styles.block}>
                <EmptyState
                  compact
                  icon={postsFailed ? 'cloud-offline-outline' : 'chatbubbles-outline'}
                  title={postsFailed ? 'Akış alınamadı' : 'Henüz gönderi yok'}
                  message={
                    postsFailed
                      ? 'Bağlantınızı kontrol edip tekrar deneyin.'
                      : isOwnCompany
                        ? 'Paylaştığınız gönderiler firma sayfanızda burada görünür.'
                        : 'Bu firma henüz gönderi paylaşmadı.'
                  }
                  actionLabel={postsFailed ? 'Tekrar dene' : isOwnCompany ? 'Gönderi Paylaş' : undefined}
                  onAction={postsFailed ? loadPosts : isOwnCompany ? () => navigation.navigate('CreatePost') : undefined}
                />
              </View>
            )
          ) : (
            <View style={styles.block}>
              <EmptyState compact icon="people-outline" title="Kişi yok" message="Bu firmaya bağlı kullanıcı yok." />
            </View>
          )
        }
        renderItem={({ item, index }) => {
          if (tab === 'products') {
            const product = item as Product;
            return (
              <ProductRow
                product={product}
                showCompany={false}
                divider={index < visibleProducts.length - 1}
                // Herkes için ürün sayfası açılıyor; düzenleme oradaki düğmede.
                onPress={() => navigation.navigate('ProductDetail', { productId: product.id })}
                onRequestSample={
                  !isOwnCompany && user
                    ? () => navigation.navigate('SampleRequestForm', { productId: product.id, productCode: product.code })
                    : undefined
                }
              />
            );
          }
          if (tab === 'feed') {
            const post = item as FeedPost;
            return (
              <View style={styles.postWrap}>
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
              </View>
            );
          }
          const person = item as { id: string; firstName: string; lastName: string; position: string };
          return (
            <ListRow
              title={`${person.firstName} ${person.lastName}${person.id === user?.id ? ' (siz)' : ''}`}
              subtitle={person.position}
              minHeight={60}
              divider={index < people.length - 1}
              onPress={() => navigation.navigate('Profile', { userId: person.id })}
            />
          );
        }}
      />
    </SafeAreaView>
  );
}

function FilterChip({
  label,
  count,
  selected,
  onPress,
  tone = 'type',
}: {
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
  tone?: 'type' | 'usage';
}) {
  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, ${count} ürün`}
      style={({ pressed }) => [
        styles.filterChip,
        tone === 'usage' && styles.filterChipUsage,
        selected && styles.filterChipSelected,
        pressed && !selected && styles.tabPressed,
      ]}
    >
      <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>{label}</Text>
      <Text style={[styles.filterChipCount, selected && styles.filterChipTextSelected]}>{count}</Text>
    </Pressable>
  );
}

// Doğrulama düzeyi (Faz 2, Adım 7): boş düzeyde yalnızca "Doğrulandı".
// Tarih varsa ay-yıl olarak eklenir: "Belge ile doğrulandı · Eylül 2026".
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

function VerificationTag({ status }: { status: VerificationStatus }) {
  if (status === 'dogrulanmis') {
    return (
      <View style={[styles.tag, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name="checkmark" size={13} color={colors.primary} />
        <Text style={[styles.tagText, { color: colors.primary }]}>Doğrulanmış</Text>
      </View>
    );
  }
  if (status === 'inceleniyor') {
    return (
      <View style={[styles.tag, { backgroundColor: colors.warningSoft }]}>
        <Ionicons name="time-outline" size={13} color={colors.warning} />
        <Text style={[styles.tagText, { color: colors.warning }]}>İnceleniyor</Text>
      </View>
    );
  }
  return (
    <View style={[styles.tag, styles.tagOutline]}>
      <Text style={[styles.tagText, { color: colors.textMuted }]}>Doğrulanmamış</Text>
    </View>
  );
}

// Web sitesi satırı: dokununca tarayıcıda açılır. Adres "www" ile yazıldıysa
// başına https:// eklenir, yoksa Linking açamaz.
function WebsiteFact({ website }: { website: string }) {
  const lower = website.trim().toLowerCase();
  const url = lower.startsWith('http://') || lower.startsWith('https://') ? website.trim() : `https://${website.trim()}`;
  return (
    <Pressable
      onPress={() => Linking.openURL(url).catch(() => {})}
      accessibilityRole="link"
      accessibilityLabel={`Web sitesi: ${website}`}
      style={({ pressed }) => [styles.fact, styles.factDivider, pressed && styles.tabPressed]}
    >
      <Text style={styles.factLabel}>Web sitesi</Text>
      <Text style={[styles.factValue, styles.factLink]} numberOfLines={1}>
        {website}
      </Text>
    </Pressable>
  );
}

function Fact({ label, value, mono, last }: { label: string; value: string; mono?: boolean; last?: boolean }) {
  return (
    <View style={[styles.fact, !last && styles.factDivider]}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={[styles.factValue, mono && styles.factValueMono]} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingBottom: spacing.xl },
  banner: { margin: spacing.gutter, marginBottom: 0 },
  block: { backgroundColor: colors.surface },
  identityBlock: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.gutter },
  identityTexts: { flex: 1, gap: spacing.xs },
  name: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 28, color: colors.text },
  tagRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  tagOutline: { borderWidth: 1, borderColor: colors.border },
  tagText: { ...typography.caption, fontFamily: fonts.semibold },
  taxId: { ...typography.mono, fontSize: 14, lineHeight: 19, color: colors.textMuted },
  actions: { marginTop: 12, gap: spacing.sm },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1, paddingHorizontal: spacing.sm },
  // Sekmeler: seçili olanın altında lacivert çizgi (orijinal tasarım).
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabBarContent: { flexGrow: 1 },
  tabItem: {
    flexGrow: 1,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemSelected: { borderBottomColor: colors.primary },
  tabPressed: { backgroundColor: colors.pressed },
  tabLabel: { ...typography.label, fontFamily: fonts.semibold, color: colors.textMuted },
  tabLabelSelected: { color: colors.primary },
  aboutBlock: { paddingHorizontal: spacing.gutter, paddingVertical: spacing.md, gap: 6 },
  aboutTitle: { ...typography.subtitle, color: colors.text },
  about: { ...typography.body, color: colors.text },
  aboutEmpty: { ...typography.body, color: colors.textMuted },
  aboutEmptyAction: { ...typography.label, fontFamily: fonts.semibold, color: colors.accent, marginTop: spacing.xs },
  linkPressed: { opacity: 0.6 },
  // Kendi firmasında sayfanın üstündeki "tamamla" şeridi (açık mavi blok).
  setupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.md,
  },
  setupTexts: { flex: 1, gap: 6 },
  setupTitle: { ...typography.label, fontFamily: fonts.semibold, color: colors.text },
  setupTrack: { height: 6, borderRadius: radius.sm, backgroundColor: colors.surface, overflow: 'hidden' },
  setupFill: { height: 6, borderRadius: radius.sm, backgroundColor: colors.primary },
  setupHint: { ...typography.caption, color: colors.textMuted },
  fact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 44,
    paddingHorizontal: spacing.gutter,
  },
  factDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  factLabel: { ...typography.label, fontFamily: fonts.regular, color: colors.textMuted },
  factValue: { ...typography.body, color: colors.text, flexShrink: 1, textAlign: 'right' },
  factValueMono: { fontFamily: fonts.mono },
  factLink: { color: colors.accent },
  footNote: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
  },
  chipStrip: { gap: spacing.sm, paddingHorizontal: spacing.gutter, paddingVertical: 10 },
  usageStripWrap: { borderTopWidth: 1, borderTopColor: colors.divider },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  filterChipUsage: { backgroundColor: colors.surfaceTonal, borderColor: colors.border },
  filterChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { ...typography.label, fontFamily: fonts.semibold, color: colors.text },
  filterChipCount: { ...typography.mono, fontSize: 13, lineHeight: 17, color: colors.textMuted },
  filterChipTextSelected: { color: colors.primaryText },
  // Makine parkı sekmesi (Faz 2, Adım 5)
  capacityBlock: { paddingHorizontal: spacing.gutter, paddingVertical: spacing.md, gap: 6 },
  capacityTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  capacityTexts: { flexShrink: 1, gap: 2 },
  capacityLabel: { ...typography.caption, color: colors.textMuted },
  capacityValue: { ...typography.mono, fontSize: 19, lineHeight: 25, color: colors.text },
  contractTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  contractTagOpen: { backgroundColor: colors.successSoft },
  contractTagClosed: { backgroundColor: colors.surfaceTonal },
  contractTagText: { ...typography.caption, fontFamily: fonts.semibold },
  capacityNote: { ...typography.body, color: colors.text },
  capacityUpdated: { ...typography.caption, fontSize: 11, lineHeight: 15, color: colors.textMuted },
  capacityAction: { alignSelf: 'flex-start', marginTop: spacing.xs },
  machineRow: { paddingHorizontal: spacing.gutter, paddingVertical: 10, gap: 2 },
  machineDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  machineTitle: { ...typography.label, fontFamily: fonts.semibold, color: colors.text },
  machineCount: { fontFamily: fonts.monoSemibold },
  machineSummary: { ...typography.caption, fontSize: 14, lineHeight: 19, color: colors.textMuted },
  machineNote: { ...typography.caption, color: colors.textMuted },
  // Doğrulama düzeyi açıklaması (Faz 2, Adım 7)
  verifyLine: { ...typography.caption, color: colors.textMuted },
  verifyHint: { ...typography.caption, fontFamily: fonts.semibold, color: colors.accent },
  verifyInfo: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  // Referanslar (Faz 2, Adım 7)
  refRow: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.sm },
  refDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  refTexts: {
    flex: 1,
    gap: 2,
    minHeight: MIN_TOUCH + 8,
    justifyContent: 'center',
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
  },
  refNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  refName: { ...typography.label, fontFamily: fonts.semibold, color: colors.accent, flexShrink: 1 },
  refCity: { ...typography.caption, color: colors.textMuted },
  refDetail: { ...typography.caption, color: colors.text },
  refNote: { ...typography.caption, color: colors.textMuted },
  refActions: { gap: spacing.xs, paddingVertical: spacing.sm },
  refRemove: { minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: spacing.sm },
  refRemoveText: { ...typography.label, fontFamily: fonts.semibold, color: colors.danger },
  refHint: { ...typography.caption, color: colors.textMuted, paddingHorizontal: spacing.gutter, paddingTop: 6 },
  refHintTight: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  refSuccess: {
    ...typography.caption,
    color: colors.success,
    paddingHorizontal: spacing.gutter,
    paddingBottom: 6,
  },
  refEmpty: { ...typography.body, color: colors.textMuted, padding: spacing.gutter },
  refFormBlock: { paddingHorizontal: spacing.gutter, paddingVertical: spacing.gutter, marginTop: spacing.blockGap },
  refFormTitle: { ...typography.subtitle, color: colors.text, marginBottom: spacing.sm },
  refFormActions: { flexDirection: 'row', gap: spacing.sm },
  refFormButton: { flex: 1 },
  loading: { marginVertical: spacing.lg },
  postWrap: { marginBottom: spacing.blockGap },
});
