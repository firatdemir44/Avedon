import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';

// Doğal ses: hizmet hesabı JWT'si doğru imzalanır, ses bir kez üretilip önbellekten döner, sınır işler.
test('Google TTS: imzalı oturum, MP3, önbellek ve günlük sınır (fetch sahte)', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  process.env.GOOGLE_TTS_CREDENTIALS = JSON.stringify({ client_email: 'tts@proje.iam.gserviceaccount.com', private_key: pem, project_id: 'proje' });
  const calls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push(String(url));
    if (String(url).includes('oauth2')) {
      const assertion = new URLSearchParams(String(init.body)).get('assertion')!;
      const [h, c, sig] = assertion.split('.');
      const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${c}`), publicKey, Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
      assert.ok(ok, 'JWT imzası doğrulanmalı');
      return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
    }
    const body = JSON.parse(String(init.body));
    assert.equal(body.voice.name, 'tr-TR-Chirp3-HD-Kore');
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer tok');
    return new Response(JSON.stringify({ audioContent: Buffer.from('mp3').toString('base64') }), { status: 200 });
  }) as typeof fetch;
  try {
    const m = await import('./textToSpeech');
    assert.equal(m.isTtsConfigured(), true);
    const a = await m.synthesize('Merhaba Fırat.', 'tr');
    assert.equal(a.toString(), 'mp3');
    await m.synthesize('Merhaba Fırat.', 'tr');
    assert.equal(calls.filter((u) => u.includes('texttospeech')).length, 1, 'aynı metin önbellekten gelmeli');
    assert.equal(calls.filter((u) => u.includes('oauth2')).length, 1, 'oturum önbellekten gelmeli');
    m.checkAndCount('u1', m.DAILY_USER_CHARS - 10);
    assert.throws(() => m.checkAndCount('u1', 20), m.TtsLimitError);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.GOOGLE_TTS_CREDENTIALS;
  }
});
