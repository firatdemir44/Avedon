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

  const existing = await prisma.company.count();
  if (existing > 0) {
    console.log('Seed atlandı: firma verisi zaten mevcut.');
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

  console.log('Seed tamamlandı.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
