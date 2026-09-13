const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'xd');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest'), 'utf8'));

// manifest'ten: artboard klasör yolu -> ekran adı
const nameByPath = new Map();
(function rec(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach(rec);
  if (node.path && String(node.path).startsWith('artboard-') && node.name) {
    nameByPath.set(String(node.path), node.name);
  }
  Object.values(node).forEach(rec);
})(manifest);

function textsOf(file) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = [];
  (function rec(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(rec);
    if (typeof node.rawText === 'string') {
      const t = node.rawText.replace(/\s+/g, ' ').trim();
      if (t) out.push(t);
    }
    Object.values(node).forEach(rec);
  })(json);
  return [...new Set(out)];
}

const screens = [];
for (const dir of fs.readdirSync(path.join(ROOT, 'artwork'))) {
  const file = path.join(ROOT, 'artwork', dir, 'graphics', 'graphicContent.agc');
  if (!fs.existsSync(file)) continue;
  const name = nameByPath.get(dir) ?? dir;
  try {
    screens.push({ name, texts: textsOf(file) });
  } catch {
    screens.push({ name, texts: [] });
  }
}

screens.sort((a, b) => a.name.localeCompare(b.name, 'tr'));

const lines = screens.map((s) => `### ${s.name}\n${s.texts.join(' · ')}`);
fs.writeFileSync(path.join(__dirname, 'xd-texts.md'), lines.join('\n\n'), 'utf8');

console.log('ekran sayisi:', screens.length);
console.log('toplam metin dugumu:', screens.reduce((n, s) => n + s.texts.length, 0));
console.log('cikti: xd-texts.md');
