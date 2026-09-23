import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hsGroup, nafCodesFor, segmentWeight, sicCodesFor, INDUSTRIES } from './segments';
import { parseSirene } from './sources/sirene';
import { parseWikidata, wikidataQuery } from './sources/wikidata';
import { parseCompaniesHouse } from './sources/companiesHouse';
import { scoreBuyer, formatRevenue } from './score';
import { normalizeName } from './types';

const fx = (f: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', f), 'utf8'));

test('HS6 → ürün grubu', () => {
  assert.equal(hsGroup('520512'), 'iplik');
  assert.equal(hsGroup('540233'), 'iplik');
  assert.equal(hsGroup('550932'), 'iplik');
  assert.equal(hsGroup('600410'), 'kumas');
  assert.equal(hsGroup('520811'), 'kumas');
  assert.equal(hsGroup('540752'), 'kumas');
  assert.equal(hsGroup('580421'), 'kumas');
  assert.equal(hsGroup('610910'), 'giyim');
  assert.equal(hsGroup('620342'), 'giyim');
  assert.equal(hsGroup('630231'), 'ev');
});

test('segment kodları: iplik → kumaş üreticisi; kumaş → konfeksiyon + toptancı; giyim → giyim toptancısı + perakende', () => {
  assert.deepEqual(nafCodesFor('iplik').sort(), ['13.20Z', '13.91Z']);
  assert.ok(nafCodesFor('kumas').includes('14.13Z') && nafCodesFor('kumas').includes('46.41Z') && nafCodesFor('kumas').includes('13.92Z'));
  assert.ok(nafCodesFor('giyim').includes('46.42Z') && nafCodesFor('giyim').includes('47.71Z'));
  assert.ok(!sicCodesFor('giyim').includes('47710'), 'CH büyüklük vermiyor: perakende dışarıda');
  assert.ok(sicCodesFor('kumas').includes('14131') && sicCodesFor('kumas').includes('46410'));
  assert.equal(segmentWeight('iplik', 'sirene', '14.13Z'), 0);
  assert.equal(segmentWeight('kumas', 'companies_house', '14132'), 1);
  for (const i of INDUSTRIES) assert.ok(i.label && i.sic.length);
});

test('Sirene ayrıştırıcı: bireysel girişimci ve gizli kayıt atlanır, kişi adı saklanmaz', () => {
  const { buyers, totalPages } = parseSirene(fx('sirene-46.41Z.json'), '46.41Z');
  assert.equal(totalPages, 3);
  assert.deepEqual(buyers.map((b) => b.sourceId), ['582015251', '333333333']);
  const a = buyers[0];
  assert.equal(a.city, 'PARIS');
  assert.equal(a.segment, 'kumas_toptan');
  assert.equal(a.sizeLabel, '100–199 çalışan');
  assert.equal(a.employeesMin, 100);
  assert.equal(a.revenueEur, 12400000); // son yıl
  assert.equal(a.foundedYear, 1958);
  assert.ok(!JSON.stringify(buyers).includes('DUPONT'));
  assert.equal(buyers[1].sizeLabel, '10–19 çalışan'); // merkez dilimine düşer
});

test('Sirene: perakende (47.71Z) 50 çalışan altı atlanır', () => {
  const json = {
    results: [
      { siren: '1', nom_complet: 'PETITE BOUTIQUE', activite_principale: '47.71Z', tranche_effectif_salarie: '03' },
      { siren: '2', nom_complet: 'GRANDE ENSEIGNE', activite_principale: '47.71Z', tranche_effectif_salarie: '41' },
    ],
  };
  assert.deepEqual(parseSirene(json, '47.71Z').buyers.map((b) => b.name), ['GRANDE ENSEIGNE']);
});

test('Wikidata ayrıştırıcı ve sorgu', () => {
  const list = parseWikidata(fx('wikidata-FR.json'), 'FR');
  assert.equal(list.length, 2);
  assert.equal(list[0].website, 'https://example.fr');
  assert.equal(list[0].employeesMin, 1200);
  assert.equal(list[0].foundedYear, 1925);
  assert.equal(list[0].segment, 'marka');
  assert.equal(list[1].website, '');
  assert.match(wikidataQuery('DE'), /wdt:P17 wd:Q183/);
  assert.match(wikidataQuery('XX'), /wdt:P297 "XX"/);
  assert.match(wikidataQuery('DE'), /Q1618899/);
  assert.throws(() => wikidataQuery('D"E'));
});

test('Companies House ayrıştırıcı', () => {
  const list = parseCompaniesHouse(fx('companies-house.json'), ['46410', '14131', '14132']);
  assert.deepEqual(list.map((b) => b.sourceId), ['01234567', 'SC123456']);
  assert.equal(list[0].industryCode, '46410');
  assert.equal(list[0].segment, 'kumas_toptan');
  assert.equal(list[1].segment, 'konfeksiyon');
  assert.equal(list[0].city, 'Manchester');
});

test('Puan: büyük, cirosu belli toptancı kumaş için yüksek; iplik için uyumsuz', () => {
  const b = { source: 'sirene', industryCode: '46.41Z', sizeLabel: '100–199 çalışan', employeesMin: 100, categorie: 'ETI', revenueEur: 12_400_000, website: '', city: 'PARIS', sourceUpdatedAt: new Date('2026-08-01') };
  const s = scoreBuyer(b, 'kumas', new Date('2026-09-23').getTime());
  assert.equal(s.score, 36 + 26 + 5 + 10 + 0);
  assert.ok(s.reasons.includes("Fransa ticaret sicilinde 'Tekstil toptancılığı (46.41Z)' olarak kayıtlı"));
  assert.ok(s.reasons.includes('100–199 çalışan'));
  assert.ok(s.reasons.includes('Yıllık ciro ~12 milyon €'));
  assert.equal(scoreBuyer(b, 'iplik').parts[0].points, 0);
});

test('Puan: Wikidata markası web sitesiyle', () => {
  const s = scoreBuyer({ source: 'wikidata', industryCode: 'Q1618899', sizeLabel: '', employeesMin: null, categorie: null, revenueEur: null, website: 'https://x.fr', city: '', sourceUpdatedAt: null }, 'giyim');
  assert.equal(s.score, 40 + 12 + 15 + 0 + 5);
  assert.ok(s.reasons.includes('Web sitesi var'));
  assert.ok(s.reasons.includes("Wikidata'da moda markası kuruluşu olarak kayıtlı"));
});

test('yardımcılar', () => {
  assert.equal(formatRevenue(1_500_000_000), '~1,5 milyar €');
  assert.equal(formatRevenue(250_000), '~250 bin €');
  assert.equal(normalizeName('Société Générale SAS (SG)'), 'societe generale');
});
