// Texart test seti komutu (TEXART.md §7, KOMUT.md Adım 2):
//   npm.cmd run texart:test            → texart/testset/ içindeki tüm fotoğraflar
//   npm.cmd run texart:test -- siyah   → adında "siyah" geçenler
// Her çalıştırma texart/reports/<zaman>/ altına önce/sonra karşılaştırma sayfası (index.html),
// ölçüm tablosu (olcumler.csv) ve her fotoğrafın işlem kaydını yazar; texart/reports/son.html en
// son çalıştırmaya yönlenir. Veritabanı ve sunucu gerekmez: iş kuyruğuyla aynı hat (runPipeline).
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { runPipeline, type PipelineResult } from '../src/texart/pipeline';

const ROOT = path.resolve(__dirname, '..', '..', 'texart');
const TESTSET = path.join(ROOT, 'testset');
const REPORTS = path.join(ROOT, 'reports');
const EXT = /\.(jpe?g|png|webp|heic|heif)$/i;

// Sadakat eşikleri (TEXART.md §4) — ölçümler Adım 4'te hatta eklenince burada değerlendirilir.
const THRESHOLDS = { doku_ssim: { min: 0.9 }, dE2000_ort: { max: 8 }, dE2000_yerel_std: { max: 2 } } as const;
type MetricKey = keyof typeof THRESHOLDS;

type Row = { file: string; ms: number; result?: PipelineResult; error?: string; outputs: Record<string, string> };

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function metricVerdict(key: MetricKey, v: unknown): 'gecti' | 'kaldi' | 'yok' {
  if (typeof v !== 'number') return 'yok';
  const t = THRESHOLDS[key] as { min?: number; max?: number };
  if (t.min !== undefined && v < t.min) return 'kaldi';
  if (t.max !== undefined && v > t.max) return 'kaldi';
  return 'gecti';
}

/** Bir fotoğraf sadakat denetiminden geçti mi: ölçüm yoksa "yok" (henüz ölçülmüyor). */
function fidelity(r: Row): 'gecti' | 'kaldi' | 'yok' | 'hata' | 'yeniden_cekim' {
  if (r.error) return 'hata';
  if (!r.result) return 'hata';
  if (r.result.durum === 'yeniden_cekim') return 'yeniden_cekim';
  const verdicts = (Object.keys(THRESHOLDS) as MetricKey[]).map((k) => metricVerdict(k, r.result!.olcumler[k]));
  if (verdicts.every((v) => v === 'yok')) return 'yok';
  return verdicts.includes('kaldi') ? 'kaldi' : 'gecti';
}

async function main() {
  const filter = process.argv[2]?.toLocaleLowerCase('tr-TR');
  if (!fs.existsSync(TESTSET)) fs.mkdirSync(TESTSET, { recursive: true });
  const files = fs
    .readdirSync(TESTSET)
    .filter((f) => EXT.test(f))
    .filter((f) => !filter || f.toLocaleLowerCase('tr-TR').includes(filter))
    .sort((a, b) => a.localeCompare(b, 'tr'));
  if (!files.length) {
    console.log(`Test fotoğrafı yok: ${TESTSET}`);
    process.exit(1);
  }

  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const out = path.join(REPORTS, stamp);
  fs.mkdirSync(out, { recursive: true });

  const rows: Row[] = [];
  for (const file of files) {
    const base = file.replace(EXT, '');
    const dir = path.join(out, base);
    fs.mkdirSync(dir, { recursive: true });
    const input = fs.readFileSync(path.join(TESTSET, file));
    const t0 = performance.now();
    const row: Row = { file, ms: 0, outputs: {} };
    try {
      const result = await runPipeline(input);
      row.ms = Math.round(performance.now() - t0);
      row.result = result;
      // Orijinal tarayıcıda görünsün diye olduğu gibi kopyalanır (HEIC tarayıcıda açılmaz; o durumda katalog yeter).
      fs.writeFileSync(path.join(dir, `orijinal${path.extname(file).toLowerCase()}`), input);
      row.outputs.orijinal = `${base}/orijinal${path.extname(file).toLowerCase()}`;
      if (result.durum === 'tamam') {
        for (const [name, buf] of Object.entries(result.ciktilar)) {
          if (!buf) continue;
          const f = `${name}.${name === 'renk_cipi' ? 'png' : 'jpg'}`;
          fs.writeFileSync(path.join(dir, f), buf);
          row.outputs[name] = `${base}/${f}`;
        }
      }
      const { ciktilar: _omit, ...record } = result as PipelineResult & { ciktilar?: unknown };
      fs.writeFileSync(path.join(dir, 'islem_kaydi.json'), JSON.stringify(record, null, 2));
    } catch (err) {
      row.ms = Math.round(performance.now() - t0);
      row.error = String((err as Error)?.message ?? err);
    }
    rows.push(row);
    console.log(`${fidelity(row).padEnd(13)} ${String(row.ms).padStart(5)} ms  ${file}${row.error ? '  ' + row.error : ''}`);
  }

  fs.writeFileSync(path.join(out, 'olcumler.csv'), csv(rows), 'utf8');
  fs.writeFileSync(path.join(out, 'index.html'), html(rows, stamp), 'utf8');
  fs.writeFileSync(
    path.join(REPORTS, 'son.html'),
    `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${stamp}/index.html"><a href="${stamp}/index.html">${stamp}</a>`,
    'utf8'
  );
  const s = summary(rows);
  console.log(`\n${rows.length} fotoğraf · geçti ${s.gecti} · kaldı ${s.kaldi} · ölçüm yok ${s.yok} · yeniden çekim ${s.yeniden_cekim} · hata ${s.hata}`);
  console.log(`Karşılaştırma sayfası: ${path.join(out, 'index.html')}`);
}

function summary(rows: Row[]) {
  const s = { gecti: 0, kaldi: 0, yok: 0, hata: 0, yeniden_cekim: 0 };
  rows.forEach((r) => s[fidelity(r)]++);
  return s;
}

function csv(rows: Row[]) {
  const keys = Object.keys(THRESHOLDS) as MetricKey[];
  const head = ['dosya', 'durum', 'sadakat', 'sure_ms', ...keys, 'olcek_kaynagi', 'renkler', 'uyarilar'];
  const lines = rows.map((r) => {
    const res = r.result;
    const m = (res?.olcumler ?? {}) as Record<string, unknown>;
    const colors = res && res.durum === 'tamam' ? res.renkler.map((c) => c.hex).join(' ') : '';
    return [r.file, r.error ? 'hata' : res?.durum, fidelity(r), r.ms, ...keys.map((k) => m[k] ?? ''), m.olcek_kaynagi ?? '', colors, (res?.uyarilar ?? [r.error]).join(' | ')]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
      .join(';');
  });
  // BOM: Excel Türkçe karakterleri doğru açsın; ayraç ; (Türkçe Excel).
  return '﻿' + [head.join(';'), ...lines].join('\r\n');
}

const LABEL: Record<string, string> = { gecti: 'Geçti', kaldi: 'Kaldı', yok: 'Ölçüm yok', hata: 'Hata', yeniden_cekim: 'Yeniden çekim' };

function html(rows: Row[], stamp: string) {
  const s = summary(rows);
  const keys = Object.keys(THRESHOLDS) as MetricKey[];
  const measured = s.gecti + s.kaldi;
  const rate = measured ? Math.round((s.gecti / measured) * 100) : null;
  const cards = rows
    .map((r) => {
      const res = r.result;
      const f = fidelity(r);
      const m = (res?.olcumler ?? {}) as Record<string, unknown>;
      const img = (k: string, cap: string) =>
        r.outputs[k] ? `<figure><a href="${esc(r.outputs[k])}" target="_blank"><img loading="lazy" src="${esc(r.outputs[k])}" alt="${esc(cap)}"></a><figcaption>${esc(cap)}</figcaption></figure>` : '';
      const colors =
        res && res.durum === 'tamam'
          ? res.renkler.map((c) => `<span class="chip"><i style="background:${esc(c.hex)}"></i>${esc(c.hex)}${c.ad ? ' · ' + esc(c.ad) : ''}</span>`).join('')
          : '';
      const metricCells = keys
        .map((k) => `<td class="${metricVerdict(k, m[k])}">${typeof m[k] === 'number' ? (m[k] as number).toFixed(k === 'doku_ssim' ? 3 : 2) : '—'}</td>`)
        .join('');
      const log = (res?.islem_kaydi ?? [])
        .map((e) => `<tr><td>${esc(e.adim)}</td><td>${esc(e.risk ?? '')}</td><td>${esc(e.durum)}</td><td>${esc(e.doz ?? '')}</td><td>${esc(e.not ?? '')}${e.olcum ? ` <code>${esc(JSON.stringify(e.olcum))}</code>` : ''}</td></tr>`)
        .join('');
      return `<section class="card" id="${esc(r.file)}">
  <header><h2>${esc(r.file)}</h2><span class="badge ${f}">${LABEL[f]}</span><span class="muted">${r.ms} ms${res && res.durum === 'tamam' ? ` · ${res.boyut.width}×${res.boyut.height}` : ''}</span></header>
  ${r.error ? `<p class="err">${esc(r.error)}</p>` : ''}
  <div class="pair">${img('orijinal', 'Önce · orijinal')}${img('katalog', 'Sonra · katalog')}${img('yakin_plan', 'Yakın plan')}</div>
  ${colors ? `<div class="chips">${colors}</div>` : ''}
  <table class="metrics"><tr>${keys.map((k) => `<th>${k}</th>`).join('')}</tr><tr>${metricCells}</tr></table>
  ${res?.uyarilar.length ? `<p class="warn">Uyarılar: ${res.uyarilar.map(esc).join(' · ')}</p>` : ''}
  <details><summary>İşlem kaydı</summary><table class="log"><tr><th>Adım</th><th>Risk</th><th>Durum</th><th>Doz</th><th>Not / ölçüm</th></tr>${log}</table></details>
</section>`;
    })
    .join('\n');
  const table = rows
    .map((r) => {
      const m = (r.result?.olcumler ?? {}) as Record<string, unknown>;
      const f = fidelity(r);
      return `<tr><td><a href="#${esc(r.file)}">${esc(r.file)}</a></td><td class="${f}">${LABEL[f]}</td>${keys
        .map((k) => `<td class="${metricVerdict(k, m[k])}">${typeof m[k] === 'number' ? (m[k] as number).toFixed(k === 'doku_ssim' ? 3 : 2) : '—'}</td>`)
        .join('')}<td>${r.ms}</td></tr>`;
    })
    .join('');
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Texart test seti</title>
<style>
:root{--bg:#f6f4f0;--card:#fff;--ink:#1d2433;--muted:#6b7280;--line:#e5e1d8;--ok:#1f7a4d;--bad:#b42318;--warn:#9a6700;--none:#6b7280}
@media (prefers-color-scheme:dark){:root{--bg:#14171d;--card:#1d2129;--ink:#e8e6e1;--muted:#9aa1ad;--line:#2d333d;--ok:#4cc38a;--bad:#f97066;--warn:#e3b341;--none:#9aa1ad}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;padding:24px 16px}
main{max-width:1200px;margin:0 auto}h1{margin:0 0 4px;font-size:22px}h2{margin:0;font-size:16px;word-break:break-all}.muted{color:var(--muted)}
.summary{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0}.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px}.stat b{display:block;font-size:20px}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
.wrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:10px;margin-bottom:24px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:20px}
.card header{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:12px}
.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
figure{margin:0}img{width:100%;aspect-ratio:1;object-fit:contain;background:repeating-conic-gradient(var(--line) 0 25%,transparent 0 50%) 0 0/16px 16px;border-radius:8px;display:block}
figcaption{font-size:12px;color:var(--muted);margin-top:4px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;border:1px solid var(--line);border-radius:99px;padding:2px 10px 2px 3px}.chip i{width:18px;height:18px;border-radius:50%;display:inline-block;border:1px solid var(--line)}
.badge{font-size:12px;font-weight:600;border-radius:99px;padding:2px 10px;border:1px solid currentColor}
.gecti{color:var(--ok)}.kaldi,.hata{color:var(--bad)}.yeniden_cekim{color:var(--warn)}.yok{color:var(--none)}
.metrics{margin-top:8px}.warn{color:var(--warn);font-size:13px}.err{color:var(--bad)}details{margin-top:8px}code{font-size:11px;word-break:break-all}
</style></head><body><main>
<h1>Texart test seti</h1>
<p class="muted">Çalıştırma ${esc(stamp)} · eşikler: doku SSIM ≥ 0,90 · ort. ΔE2000 ≤ 8 · yerel ΔE std ≤ 2 (TEXART.md §4) · kabul: ölçülenlerin ≥ %90'ı geçer</p>
<div class="summary">
<div class="stat"><b>${rows.length}</b>fotoğraf</div>
<div class="stat"><b class="gecti">${s.gecti}</b>geçti</div>
<div class="stat"><b class="kaldi">${s.kaldi}</b>kaldı</div>
<div class="stat"><b class="yeniden_cekim">${s.yeniden_cekim}</b>yeniden çekim</div>
<div class="stat"><b class="yok">${s.yok}</b>ölçüm yok</div>
<div class="stat"><b class="hata">${s.hata}</b>hata</div>
<div class="stat"><b>${rate === null ? '—' : '%' + rate}</b>geçme oranı</div>
</div>
<div class="wrap"><table><tr><th>Dosya</th><th>Sadakat</th>${keys.map((k) => `<th>${k}</th>`).join('')}<th>ms</th></tr>${table}</table></div>
${cards}
</main></body></html>`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
