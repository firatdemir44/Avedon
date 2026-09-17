import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, ScrollView, ActivityIndicator, Linking, Share, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import {
  deletePost,
  fetchCompany,
  fetchCompanyFeed,
  fetchQuoteRequests,
  likePost,
  unlikePost,
  type FeedPost,
} from '../../api/client';
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
type CompanyTab = 'about' | 'products' | 'feed' | 'people';

const TABS: { key: CompanyTab; label: string }[] = [
  { key: 'about', label: 'Hakkında' },
  { key: 'products', label: 'Ürünler' },
  { key: 'feed', label: 'Akış' },
  { key: 'people', label: 'Kişiler' },
];

export function CompanyProfileScreen({ navigation, route }: Props) {
  const { user } = useSession();
  const viewedCompanyId = route.params?.companyId ?? user?.companyId ?? null;
  const isOwnCompany = !!user?.companyId && viewedCompanyId === user.companyId;
  const [tab, setTab] = useState<CompanyTab>('about');
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
  useFocusEffect(
    useCallback(() => {
      if (!isOwnCompany) return;
      let cancelled = false;
      fetchQuoteRequests('seller')
        .then(({ requests }) => {
          if (!cancelled) setOpenQuoteRequests(requests.filter((r) => r.status === 'open').length);
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
            <VerificationTag status={company.verification} />
            <Text style={styles.taxId}>VKN {company.taxId}</Text>
          </View>
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
          <PrimaryButton
            label="Firmayı Düzenle"
            variant="outline"
            icon="create-outline"
            onPress={() => navigation.navigate('EditCompany', { companyId: company.id })}
          />
        </View>
      ) : null}
    </View>
  );

  const tabBar = (
    <View style={styles.tabBar} accessibilityRole="tablist">
      {TABS.map((item) => {
        const selected = tab === item.key;
        const count =
          item.key === 'products' ? products.length : item.key === 'people' ? people.length : undefined;
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
    </View>
  );

  const aboutContent = (
    <View>
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
        })}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          tab === 'about' ? null : tab === 'products' ? (
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
  tabItem: {
    flex: 1,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
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
  loading: { marginVertical: spacing.lg },
  postWrap: { marginBottom: spacing.blockGap },
});
