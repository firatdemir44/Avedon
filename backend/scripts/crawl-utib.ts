// UTİB (Uludağ Tekstil İhracatçıları Birliği) herkese açık üye listesi → firma rehberi tohumu.
// Kurallar (2026-09-23): robots.txt "Crawl-delay: 10" → sayfalar arası 10 sn; tanımlı User-Agent;
// yalnızca tüzel kişi bilgisi (unvan, il, web). Telefon/adres SAKLANMAZ; kişi adı zaten yok.
// Şahıs firması gibi görünen (şirket türü eki olmayan) kayıtlar atlanır.
// Çıktı: data/directory/utib.json (backend açılışta içe aktarır, mükerrer ad atlanır).
//   npx.cmd tsx scripts/crawl-utib.ts [ilkSayfa] [sonSayfa]
import fs from 'fs';
import path from 'path';

const UA = 'TakyonBot/1.0 (+https://takyon.ai; firatdemir@gmail.com)';
const BASE = 'https://utib.org.tr/tr/uyeler';
const DELAY_MS = 10_000;

type Row = { name: string; category: string; city?: string; website?: string; source: string; tags?: string[] };

const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const COMPANY_SUFFIX = /(LTD|ŞTİ|STI|A\.Ş|A\.S\.|ANONİM|LİMİTED|LIMITED|KOOPERATİF|KOLL|KOM\.)/i;
const NON_TEXTILE = /(OTOMOTİV|RENT A CAR|GAYRİMENKUL|KUYUMCU|İNŞAAT|GIDA|REKLAM|TABELA|MOBİLYA|ELEKTRONİK|KOZMETİK|MEDİKAL|TURİZM|LOJİSTİK|NAKLİYAT|MOTORS)/i;
const TEXTILE = /(TEKSTİL|TEKSTIL|MENSUCAT|İPLİK|IPLIK|ÖRME|ORME|DOKUMA|KUMAŞ|KUMAS|KONFEKSİYON|GİYİM|GIYIM|BOYA|APRE|TERBİYE|FİNİŞ|DÜĞME|FERMUAR|ETİKET|AKSESUAR|NAKIŞ|BRODE|DANTEL|TRİKO|ÇORAP|PERDE|MEFRUŞAT|HAVLU|ELYAF|İPEK|YÜN|PAMUK|DENİM|TÜL|BASKI|FASON)/i;

function categorize(name: string): { category: string; tags: string[] } | null {
  const n = name.toLocaleUpperCase('tr');
  const tags = new Set<string>();
  if (/(İPLİK|IPLIK|ELYAF|BÜKÜM|FİLAMENT)/.test(n)) tags.add('iplik');
  if (/(ÖRME|ORME|DOKUMA|KUMAŞ|KUMAS|MENSUCAT|DENİM|TÜL|DANTEL|TRİKO)/.test(n)) tags.add('kumas_uretici');
  if (/(KONFEKSİYON|GİYİM|GIYIM|HAZIR GİY|ÇORAP)/.test(n)) tags.add('konfeksiyon');
  if (/(BOYA|APRE|TERBİYE|FİNİŞ|YIKAMA)/.test(n)) tags.add('boyahane');
  if (/(DÜĞME|FERMUAR|ETİKET|AKSESUAR)/.test(n)) tags.add('aksesuar');
  if (/(BASKI|NAKIŞ|BRODE)/.test(n)) tags.add('baski');
  if (!tags.size) {
    if (NON_TEXTILE.test(n) && !TEXTILE.test(n)) return null;
    if (!TEXTILE.test(n)) return null; // tekstil ipucu yoksa şimdilik alma (web sitesinden sonra zenginleştirilebilir)
    tags.add('diger');
  }
  const order = ['kumas_uretici', 'iplik', 'boyahane', 'konfeksiyon', 'aksesuar', 'baski', 'diger'];
  const [category, ...rest] = order.filter((k) => tags.has(k));
  return { category, tags: rest };
}

function parse(html: string): Row[] {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, '\n')
    .split('\n')
    .map(decode)
    .filter(Boolean);
  const start = text.findIndex((s) => s === 'kayıt bulunmuştur');
  if (start < 0) return [];
  const rows: Row[] = [];
  const body = text.slice(start + 1);
  for (let i = 0; i < body.length; i++) {
    const name = body[i];
    const addr = body[i + 1];
    const phone = body[i + 2];
    if (!name || !addr || !phone || !/^\+90/.test(phone)) continue;
    let website: string | undefined;
    const next = body[i + 3];
    if (next && /^(www\.|https?:\/\/)/i.test(next)) website = next.startsWith('http') ? next : `https://${next}`;
    i += website ? 3 : 2;
    if (!COMPANY_SUFFIX.test(name)) continue; // şahıs firması olabilir → kişisel veri, atla
    const cat = categorize(name);
    if (!cat) continue;
    const city = addr.split(' ').pop() ?? '';
    rows.push({ name, category: cat.category, tags: cat.tags, city: city.charAt(0) + city.slice(1).toLocaleLowerCase('tr'), website, source: 'UTİB üye listesi' });
  }
  return rows;
}

async function main() {
  const from = Number(process.argv[2] ?? 1);
  const to = Number(process.argv[3] ?? 81);
  const out = path.join(__dirname, '..', 'data', 'directory', 'utib.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const all: Row[] = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : [];
  const seen = new Set(all.map((r) => r.name));
  for (let p = from; p <= to; p++) {
    const res = await fetch(`${BASE}?page=${p}`, { headers: { 'User-Agent': UA } });
    if (!res.ok) {
      console.error('sayfa', p, res.status);
      break;
    }
    const rows = parse(await res.text()).filter((r) => !seen.has(r.name));
    rows.forEach((r) => seen.add(r.name));
    all.push(...rows);
    fs.writeFileSync(out, JSON.stringify(all, null, 1));
    console.log(`sayfa ${p}: +${rows.length} (toplam ${all.length})`);
    if (p < to) await new Promise((r) => setTimeout(r, DELAY_MS));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
