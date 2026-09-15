import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.user.upsert({
    where: { phone: '05000000000' },
    update: { isAdmin: true },
    create: {
      accountType: 'bireysel',
      position: 'Yönetici',
      firstName: 'Avedon',
      lastName: 'Admin',
      phone: '05000000000',
      phoneVerified: true,
      isAdmin: true,
    },
  });
  console.log('Admin kullanıcı hazır (telefon: 05000000000).');

  // Canlı ortamda (Render, RENDER="true" her serviste otomatik tanımlı) örnek
  // firma/ürün/gönderi EKLENMEZ: pilot kullanıcılar sahte firmaları gerçek
  // sanmasın. Start Command her açılışta seed çalıştırdığı için bu kontrol
  // şart — kalıcı diskteki boş bir veritabanına ilk açılışta demo dolardı.
  if (process.env.RENDER === 'true') {
    console.log('Canlı ortam: örnek veri atlandı.');
    return;
  }

  const existing = await prisma.company.count();
  if (existing > 0) {
    console.log('Firma/ürün seed atlandı: veri zaten mevcut.');
    await seedPosts();
    return;
  }

  const raschelCo = await prisma.company.create({
    data: { name: 'Ege Raschel Tekstil', taxId: '1111111111', companyCode: 'AVD-EGE1', verification: 'dogrulanmis' },
  });
  const ormeCo = await prisma.company.create({
    data: { name: 'Bursa Örme San.', taxId: '2222222222', companyCode: 'AVD-BRS1', verification: 'inceleniyor' },
  });
  const dokumaCo = await prisma.company.create({
    data: { name: 'Denizli Dokuma A.Ş.', taxId: '3333333333', companyCode: 'AVD-DNZ1', verification: 'dogrulanmis' },
  });

  await prisma.product.createMany({
    data: [
      {
        companyId: raschelCo.id,
        code: 'RSC-2201',
        type: 'raschel',
        stock: 1200,
        weightGsm: 220,
        widthCm: 150,
        content: '%100 Polyester',
        useArea: 'Dış Giyim / Astar',
      },
      {
        companyId: ormeCo.id,
        code: 'ORM-0587',
        type: 'orme',
        stock: 850,
        weightGsm: 180,
        widthCm: 170,
        content: '%95 Pamuk %5 Elastan',
        useArea: 'Spor Giyim',
      },
      {
        companyId: dokumaCo.id,
        code: 'DKM-1190',
        type: 'dokuma',
        stock: 3000,
        weightGsm: 140,
        widthCm: 150,
        content: '%100 Pamuk',
        useArea: 'Gömlek',
      },
      {
        companyId: ormeCo.id,
        code: 'ORM-0723',
        type: 'orme',
        stock: 60,
        weightGsm: 260,
        widthCm: 180,
        content: '%80 Pamuk %20 Polyester',
        useArea: 'Sweatshirt / Şardonlu',
      },
    ],
  });

  // Katalog alanları (Aşama A): klasör ve filtre görünümleri boş kalmasın.
  const catalogSeed: { code: string; subtype: string; usages: string[] }[] = [
    { code: 'RSC-2201', subtype: 'astarlik', usages: ['astar', 'dis_giyim'] },
    { code: 'ORM-0587', subtype: 'suprem', usages: ['tisortluk', 'spor_giyim', 'taytlik'] },
    { code: 'DKM-1190', subtype: 'poplin', usages: ['gomleklik'] },
    { code: 'ORM-0723', subtype: 'uc_iplik', usages: ['sweatshirt', 'esofman'] },
  ];
  for (const item of catalogSeed) {
    await prisma.product.updateMany({
      where: { code: item.code },
      data: { subtype: item.subtype, usages: JSON.stringify(item.usages) },
    });
  }

  await seedPosts();
  console.log('Seed tamamlandı.');
}

// Akışın ilk açılışta boş görünmemesi için birkaç örnek gönderi. Fotoğraf
// eklenmiyor — dev.db gereksiz büyümesin.
async function seedPosts() {
  if ((await prisma.post.count()) > 0) {
    console.log('Gönderi seed atlandı: zaten mevcut.');
    return;
  }

  const admin = await prisma.user.findUnique({ where: { phone: '05000000000' } });
  if (!admin) return;

  const firstProduct = await prisma.product.findFirst({ orderBy: { code: 'asc' } });

  await prisma.post.create({
    data: {
      authorId: admin.id,
      body: 'Avedon yayında! Tekstil sektöründe firmaların birbirini bulması, kumaş paylaşması ve numune talep etmesi artık tek uygulamada.',
      visibility: 'public',
    },
  });

  await prisma.post.create({
    data: {
      authorId: admin.id,
      body: 'Yeni sezon örme kumaş koleksiyonumuz hazırlanıyor. Gramaj ve en bilgilerini yakında paylaşacağız.',
      visibility: 'public',
    },
  });

  await prisma.post.create({
    data: {
      authorId: admin.id,
      body: 'Bu gönderiyi yalnızca bağlantılarım görebilir — görünürlük ayarının çalıştığını buradan test edebilirsiniz.',
      visibility: 'connections',
    },
  });

  if (firstProduct) {
    await prisma.post.create({
      data: {
        authorId: admin.id,
        body: `${firstProduct.code} kodlu kumaşımız stokta. Numune talebi için aşağıdaki butonu kullanabilirsiniz.`,
        productId: firstProduct.id,
        visibility: 'public',
      },
    });
  }

  console.log('Örnek gönderiler eklendi.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
