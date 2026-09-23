import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOCK_ROWS, cleanRow, extractMachineSheet, kindFromGuess, splitSheetDataUrl } from './importSheet';

test('tür tahmini → grup ve tür', () => {
  assert.deepEqual(kindFromGuess('yuvarlak', 'SÜPREM. TÜP'), { group: 'orme', kind: 'Yuvarlak örme (süprem)' });
  assert.deepEqual(kindFromGuess('yuvarlak', 'İNTER-RİBANA'), { group: 'orme', kind: 'Yuvarlak örme (interlok)' });
  assert.deepEqual(kindFromGuess('dokuma', ''), { group: 'dokuma', kind: 'Dokuma tezgâhı' });
});

test('satır temizliği: aralık normalize, bozuk sayı boş', () => {
  const row = cleanRow({ ...MOCK_ROWS[0], gaugeText: '28 / 22', needlesText: 'x', feeders: -3, kindGuess: 'diger' });
  assert.equal(row.gaugeText, '28-22');
  assert.equal(row.needlesText, '');
  assert.equal(row.feeders, null);
  assert.equal(row.kindGuess, 'yuvarlak');
});

test('dosya türü: görsel ve PDF', () => {
  assert.equal(splitSheetDataUrl('data:image/png;base64,QUJD')?.kind, 'image');
  assert.equal(splitSheetDataUrl('data:application/pdf;base64,QUJD')?.kind, 'pdf');
  assert.equal(splitSheetDataUrl('data:text/plain;base64,QUJD'), null);
});

test('sahte kip 3 satır döner', async () => {
  const prev = process.env.ANTHROPIC_MOCK;
  process.env.ANTHROPIC_MOCK = '1';
  try {
    const out = await extractMachineSheet({ kind: 'pdf', data: 'QUJD' });
    assert.equal(out.rows.length, 3);
    assert.equal(out.rows[1].gaugeText, '16-22');
  } finally {
    process.env.ANTHROPIC_MOCK = prev;
  }
});
