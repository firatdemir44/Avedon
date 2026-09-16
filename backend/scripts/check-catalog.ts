// Sunucu ve uygulamadaki katalog kopyalarının aynı olduğunu doğrular.
// Çalıştırma (backend klasöründe): npx tsx scripts/check-catalog.ts
import * as server from '../src/catalog';
import * as mobile from '../../mobile/src/features/products/catalog';

const pick = (c: typeof server | typeof mobile) =>
  JSON.stringify({
    types: c.PRODUCT_TYPES,
    typeLabels: c.TYPE_LABELS,
    subtypes: c.SUBTYPES,
    usages: c.USAGES,
    units: c.STOCK_UNITS,
    companyTypes: c.COMPANY_TYPES,
    yarnTypes: c.YARN_TYPES,
    yarnRoles: c.YARN_ROLES,
    yarnUnits: c.YARN_UNITS,
    finishTags: c.FINISH_TAGS,
    currencies: c.PRICE_CURRENCIES,
  });

if (pick(server) !== pick(mobile)) {
  console.error('KATALOG FARKLI: backend/src/catalog.ts ile mobile/src/features/products/catalog.ts eşitlenmeli.');
  process.exit(1);
}
console.log('Katalog kopyaları aynı.');
