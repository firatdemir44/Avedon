import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMachineWhere, machineTypeLabel, parseMachineQuery } from './query';

test('"raschel 28 fine" → Raschel, fayn 28', () => {
  const q = parseMachineQuery('raschel 28 fine');
  assert.deepEqual(q, { types: ['raschel'], gauge: 28, diameterInch: null, feeders: null, bare: [], availableOnly: false });
});

test('büyük harf ve Türkçe karakter: "YUVARLAK ÖRME 30 İNÇ 24 FAYN"', () => {
  const q = parseMachineQuery('YUVARLAK ÖRME 30 İNÇ 24 FAYN');
  assert.deepEqual(q?.types, ['yuvarlak']);
  assert.equal(q?.diameterInch, 30);
  assert.equal(q?.gauge, 24);
});

test('bitişik yazım ve tırnak: 28fine, 30"', () => {
  const q = parseMachineQuery('raschel 28fine 30"');
  assert.equal(q?.gauge, 28);
  assert.equal(q?.diameterInch, 30);
});

test('birimsiz sayı fayn ya da pus olarak tutulur', () => {
  const q = parseMachineQuery('Düz örme 12');
  assert.deepEqual(q?.types, ['duz_orme']);
  assert.deepEqual(q?.bare, [12]);
  assert.deepEqual(buildMachineWhere(q!).AND, [
    { OR: [{ kindKey: { contains: 'duz orme' } }] },
    {
      OR: [
        { gauge: 12 },
        { gaugeText: '12' },
        { gaugeText: { startsWith: '12-' } },
        { gaugeText: { endsWith: '-12' } },
        { gaugeText: { contains: '-12-' } },
        { diameterInch: 12 },
      ],
    },
  ]);
});

test('makineyle ilgisiz aramalar makine grubunu açmaz', () => {
  assert.equal(parseMachineQuery('Bursa'), null);
  assert.equal(parseMachineQuery('30/1 penye'), null);
  assert.equal(parseMachineQuery('düz dikiş'), null);
});

test('dokuma grubu ve sistem sayısı', () => {
  const q = parseMachineQuery('dokuma tezgah 96 sistem');
  assert.deepEqual(q?.types, ['dokuma']);
  assert.equal(q?.feeders, 96);
  assert.deepEqual(buildMachineWhere(q!).AND?.[0], { OR: [{ group: 'dokuma' }] });
});

test('müsait sözcüğü yalnızca boş makineleri getirir', () => {
  const q = parseMachineQuery('MÜSAİT raschel');
  assert.equal(q?.availableOnly, true);
  const now = new Date('2026-09-23T00:00:00Z');
  assert.deepEqual(buildMachineWhere(q!, now).AND?.[0], { OR: [{ busyUntil: null }, { busyUntil: { lte: now } }] });
});

test('görünen tür adı', () => {
  assert.equal(machineTypeLabel({ kind: 'Yuvarlak örme (süprem)', group: 'orme' }), 'Yuvarlak örme');
  assert.equal(machineTypeLabel({ kind: 'Raschel', group: 'orme' }), 'Raschel');
  assert.equal(machineTypeLabel({ kind: 'Rapierli tezgâh', group: 'dokuma' }), 'Dokuma');
  assert.equal(machineTypeLabel({ kind: 'Ram', group: 'boya_terbiye' }), 'Ram');
});
