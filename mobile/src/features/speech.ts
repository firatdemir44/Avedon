import { Platform } from 'react-native';
import { getLang, locale } from '../i18n';
import { fetchSpeechAudio, fetchSpeechAvailable } from '../api/client';

// Asistanla sesli konuşma (Fırat 2026-09-23): tarayıcının kendi Türkçe konuşma tanıması
// (Web Speech API) ile ses → yazı, speechSynthesis ile yazı → ses. Ek ücret ve sunucu yok.
// Destek yoksa (native ya da desteklemeyen tarayıcı) düğmeler hiç gösterilmez.

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function recognitionCtor(): (new () => Recognition) | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canListen = () => !!recognitionCtor();
export const canSpeak = () =>
  Platform.OS === 'web' && typeof window !== 'undefined' && ('speechSynthesis' in window || typeof Audio !== 'undefined');
const canBrowserSpeak = () => Platform.OS === 'web' && typeof window !== 'undefined' && 'speechSynthesis' in window;

// Doğal ses (Fırat 2026-09-25): sunucuda Google Chirp 3 HD açıksa cevap MP3 olarak çalınır; kapalıysa,
// hata verirse ya da günlük sınır dolarsa telefonun kendi sesine dönülür.
let cloudVoice: Promise<boolean> | null = null;
const hasCloudVoice = () =>
  (cloudVoice ??= fetchSpeechAvailable()
    .then((r) => !!r.voice)
    .catch(() => {
      cloudVoice = null; // bağlantı sorunu: bir sonraki okumada yeniden sor
      return false;
    }));
let player: HTMLAudioElement | null = null;
const getPlayer = () => (player ??= new Audio());
// 0,1 sn sessiz WAV: dokunuş anında çalınıp ses öğesinin kilidi açılır (iPhone otomatik okumaya izin versin).
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

export type ListenError = 'not-allowed' | 'no-speech' | 'network' | 'other';

// Dinlemeyi başlatır; ara sonuçlar onText ile gelir (kutuya yazılır). Dönen fonksiyon durdurur.
// Tarayıcı kısa bir duraklamada tanımayı kendiliğinden kapatır (özellikle telefonda 1-2 sn).
// Bu yüzden kullanıcı durdurana kadar yeniden başlatılır ve metin birikir; konuşma bittikten
// sonra SILENCE_MS sessizlikte ya da hiç konuşulmazsa IDLE_MS sonra kendiliğinden biter.
const SILENCE_MS = 4000;
const IDLE_MS = 10000;
export function startListening(opts: { onText: (text: string, final: boolean) => void; onEnd: () => void; onError: (e: ListenError) => void }): () => void {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    opts.onError('other');
    opts.onEnd();
    return () => undefined;
  }
  let stopped = false;
  let finished = false;
  let committed = ''; // önceki oturumlardan kesinleşen metin
  let rec: Recognition | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const finish = () => {
    if (finished) return;
    finished = true;
    stopped = true;
    if (timer) clearTimeout(timer);
    try {
      rec?.stop();
    } catch {
      // sessiz
    }
    opts.onEnd();
  };
  const arm = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(finish, ms);
  };
  const join = (x: string, y: string) => (x && y ? `${x} ${y}` : x || y).trim();
  const begin = () => {
    const r = new Ctor();
    rec = r;
    r.lang = locale();
    r.interimResults = true;
    r.continuous = false; // Android Chrome sürekli kipte sonuçları çiftliyor; yeniden başlatma yeterli
    let sessionFinal = '';
    r.onresult = (e) => {
      let fin = '';
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const x = e.results[i];
        if (x.isFinal) fin += x[0].transcript;
        else interim += x[0].transcript;
      }
      sessionFinal = fin.trim();
      opts.onText(join(join(committed, sessionFinal), interim.trim()), !interim);
      arm(SILENCE_MS);
    };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return; // yeniden başlatılacak
      stopped = true;
      opts.onError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'not-allowed' : e.error === 'network' ? 'network' : 'other');
    };
    r.onend = () => {
      committed = join(committed, sessionFinal);
      if (stopped) finish();
      else {
        try {
          begin();
        } catch {
          finish();
        }
      }
    };
    r.start();
  };
  try {
    begin();
    arm(IDLE_MS);
  } catch {
    opts.onError('other');
    finish();
  }
  return () => {
    stopped = true;
    try {
      rec?.stop();
    } catch {
      finish();
    }
  };
}

// Markdown işaretleri ve kod blokları sesli okumada gürültü yapar; sadeleştirilir.
function plain(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_#>`|]/g, ' ')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// Ses seçimi (2026-09-23, tek kimlik "Takyon asistanı"): cihazdaki en doğal Türkçe ses.
// Sıra: Edge/Windows "Online (Natural)" sinir sesleri > iOS "Gelişmiş/Premium" > Google Türkçe >
// diğer Türkçe sesler. Eski kişilik (İpek/Mert) ayarı yok sayılır.
export type VoicePersona = 'ipek' | 'mert';
export const setVoicePersona = (_p: VoicePersona) => undefined;
function voiceScore(v: SpeechSynthesisVoice) {
  const n = v.name.toLowerCase();
  if (/natural|neural|online/.test(n)) return 5;
  if (/premium|enhanced|geli[şs]mi[şs]/.test(n)) return 4;
  if (/google/.test(n)) return 3;
  if (!v.localService) return 2;
  return 1;
}
function pickVoice(): SpeechSynthesisVoice | null {
  const tr = window.speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().replace('_', '-').startsWith(getLang()));
  return tr.sort((x, y) => voiceScore(y) - voiceScore(x))[0] ?? null;
}

// Yazıyı konuşma diline çevirir: kısaltmalar, birimler, simgeler okunur hale gelir.
function spoken(text: string) {
  // İngilizce seslerde Türkçe okunuş kuralları uygulanmaz; yalnızca simgeler temizlenir.
  if (getLang() === 'en') {
    return plain(text)
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ')
      .replace(/%\s?(\d[\d.,]*)/g, '$1 percent')
      .replace(/(\d)\s?(gr\/m²|g\/m2|gr\/m2)/g, '$1 grams per square metre')
      .replace(/\s[·•|]\s/g, ', ')
      .replace(/\s-\s/g, ', ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return plain(text)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ')
    .replace(/%\s?(\d)/g, 'yüzde $1')
    .replace(/(\d)\s?gr\/m²|(\d)\s?g\/m2|(\d)\s?gr\/m2/g, (_m, a1, a2, a3) => `${a1 ?? a2 ?? a3} gram metrekare`)
    .replace(/(\d)\s?kg\b/g, '$1 kilo')
    .replace(/(\d)\s?cm\b/g, '$1 santim')
    .replace(/(\d)\s?mt?\b/g, '$1 metre')
    .replace(/(\d)\s?\$/g, '$1 dolar')
    .replace(/\$\s?(\d[\d.,]*)/g, '$1 dolar')
    .replace(/(\d)\s?(TL|₺)/g, '$1 lira')
    .replace(/(\d)\s?€/g, '$1 avro')
    .replace(/\bör\./gi, 'örneğin')
    .replace(/\bvb\./gi, 've benzeri')
    .replace(/\bvs\./gi, 've saire')
    .replace(/\bNe\s?(\d)/g, 'Ne $1')
    .replace(/\s[·•|]\s/g, ', ')
    .replace(/\s-\s/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Uzun metin cümlelere bölünür: Chrome tek parçada ~15 sn sonra okumayı kesiyor ve kısa
// parçalar arasındaki doğal duraklama konuşmayı akıcı kılıyor.
function sentences(text: string) {
  const parts = text.match(/[^.!?…:;]+[.!?…:;]*/g) ?? [text];
  const out: string[] = [];
  for (const p of parts.map((x) => x.trim()).filter(Boolean)) {
    if (out.length && (out[out.length - 1].length < 40 || p.length < 12)) out[out.length - 1] += ' ' + p;
    else out.push(p);
  }
  return out;
}

let speakingId: string | null = null;
const listeners = new Set<(id: string | null) => void>();
const emit = () => listeners.forEach((l) => l(speakingId));
export const onSpeakingChange = (l: (id: string | null) => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

// Telefon tarayıcıları sesi ancak kullanıcı dokunuşuyla başlatır. Mikrofona dokunulduğu anda
// boş bir okuma yapılıp ses "açılır"; cevap geldiğinde otomatik okuma izinli olur.
let voiceTurn = false;
export function unlockSpeech() {
  if (!canSpeak()) return;
  void hasCloudVoice();
  try {
    const p = getPlayer();
    p.src = SILENT_WAV;
    p.play().catch(() => undefined);
  } catch {
    // sessiz
  }
  if (!canBrowserSpeak()) return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
    window.speechSynthesis.getVoices();
  } catch {
    // sessiz
  }
}
// Soru mikrofonla sorulduysa cevap kendiliğinden okunur.
export const markVoiceTurn = () => {
  voiceTurn = true;
};
export function consumeVoiceTurn() {
  const v = voiceTurn;
  voiceTurn = false;
  return v;
}

export function stopSpeaking() {
  if (!canSpeak()) return;
  if (player) {
    player.pause();
    player.onended = null;
    player.onerror = null;
  }
  if (canBrowserSpeak()) window.speechSynthesis.cancel();
  speakingId = null;
  emit();
}

// Metni Türkçe sesle okur; aynı balona tekrar basılırsa durur.
export function toggleSpeak(id: string, text: string) {
  if (!canSpeak()) return;
  if (speakingId === id) {
    stopSpeaking();
    return;
  }
  stopSpeaking();
  const chunks = sentences(spoken(text));
  if (!chunks.length) return;
  speakingId = id;
  emit();
  void hasCloudVoice().then((ok) => (ok ? speakCloud(id, chunks) : speakBrowser(id, chunks, 0)));
}

// Sunucu parçaları: birkaç cümle birleştirilir (ilk parça kısa tutulur, ses hemen başlasın);
// bir parça çalarken sonraki indirilir.
function cloudParts(chunks: string[]) {
  const out: string[] = [];
  for (const c of chunks) {
    const limit = out.length <= 1 ? 160 : 600;
    if (out.length && out[out.length - 1].length + c.length < limit) out[out.length - 1] += ' ' + c;
    else out.push(c);
  }
  return out;
}

async function speakCloud(id: string, chunks: string[]) {
  const parts = cloudParts(chunks);
  const lang = getLang();
  const load = (i: number) => (i < parts.length ? fetchSpeechAudio(parts[i], lang) : null);
  let next = load(0);
  for (let i = 0; i < parts.length; i++) {
    if (speakingId !== id) return;
    let blob: Blob | null;
    try {
      blob = await next;
    } catch {
      // Sunucu sesi alınamadı: kalan cümleler telefonun sesiyle okunur.
      const done = parts.slice(0, i).join(' ').length;
      let consumed = 0;
      const rest = chunks.findIndex((c) => (consumed += c.length + 1) > done);
      if (speakingId === id) speakBrowser(id, chunks, Math.max(0, rest));
      return;
    }
    next = load(i + 1);
    if (!blob || speakingId !== id) return;
    const url = URL.createObjectURL(blob);
    const played = await new Promise<boolean>((resolve) => {
      const p = getPlayer();
      p.onended = () => resolve(true);
      p.onerror = () => resolve(false);
      p.src = url;
      p.play().catch(() => resolve(false));
    });
    URL.revokeObjectURL(url);
    if (!played) {
      // Çalma izni yok (ör. dokunuşsuz otomatik okuma): telefonun sesiyle devam.
      if (speakingId === id) speakBrowser(id, sentences(parts.slice(i).join(' ')), 0);
      return;
    }
  }
  if (speakingId === id) {
    speakingId = null;
    emit();
  }
}

function speakBrowser(id: string, chunks: string[], from: number) {
  if (!canBrowserSpeak()) {
    if (speakingId === id) {
      speakingId = null;
      emit();
    }
    return;
  }
  // Android'de belirli bir sesi (özellikle ağ sesi) zorlamak bazı telefonlarda HİÇ ses çıkarmıyor
  // (Fırat 2026-09-24: "okuma sesi gelmiyor"). Android'de telefonun kendi varsayılan Türkçe sesi kullanılır;
  // masaüstü/iPhone'da en doğal ses seçilir. Ses hata verirse o cümle varsayılan sesle yeniden denenir.
  const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
  const voice = isAndroid ? null : pickVoice();
  const speakChunk = (i: number, withVoice: boolean) => {
    if (speakingId !== id || i >= chunks.length) {
      if (speakingId === id) {
        speakingId = null;
        emit();
      }
      return;
    }
    const u = new SpeechSynthesisUtterance(chunks[i]);
    u.lang = locale();
    if (withVoice && voice) u.voice = voice;
    u.pitch = 1;
    u.rate = voice && withVoice && voiceScore(voice) >= 4 ? 1 : 1.05;
    let started = false;
    u.onstart = () => {
      started = true;
    };
    u.onend = () => speakChunk(i + 1, withVoice);
    u.onerror = (e) => {
      const err = (e as SpeechSynthesisErrorEvent).error;
      if (err === 'interrupted' || err === 'canceled') return;
      // Seçilen ses çalışmadıysa varsayılan sesle aynı cümleyi tekrar dene.
      if (withVoice && voice && !started) speakChunk(i, false);
      else speakChunk(i + 1, withVoice);
    };
    window.speechSynthesis.speak(u);
    // Chrome bazen duraklatılmış kalır; güvence olarak sürdür.
    window.speechSynthesis.resume();
  };
  // cancel()'dan hemen sonra speak() bazı tarayıcılarda sessizce düşüyor; kısa bekleme.
  setTimeout(() => speakChunk(from, true), 80);
}

// Kayıt yolu (2026-09-23): tarayıcı tanıması telefonda kısa sürede kapandığı için ses kaydedilir,
// kullanıcı durdurunca sunucuda (Whisper) yazıya çevrilir. En çok MAX_REC_MS kayıt.
const MAX_REC_MS = 120_000;
export const canRecord = () =>
  Platform.OS === 'web' && typeof window !== 'undefined' && typeof (window as unknown as { MediaRecorder?: unknown }).MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

// onLevel: kayıt sırasında ses seviyesi (0-1), ekranda "sizi duyuyorum" göstergesi için.
export async function startRecording(opts: { onDone: (audio: Blob | null) => void; onError: (e: ListenError) => void; onLevel?: (level: number) => void }): Promise<() => void> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (err) {
    opts.onError((err as Error)?.name === 'NotAllowedError' ? 'not-allowed' : 'other');
    opts.onDone(null);
    return () => undefined;
  }
  const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((m) => MediaRecorder.isTypeSupported?.(m));
  const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const timer = setTimeout(() => stop(), MAX_REC_MS);
  // Ses seviyesi ölçümü (Web Audio); desteklenmezse gösterge yalnızca süreyi gösterir.
  let levelTimer: ReturnType<typeof setInterval> | null = null;
  let audioCtx: AudioContext | null = null;
  if (opts.onLevel) {
    try {
      const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        audioCtx = new Ctx();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        audioCtx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        levelTimer = setInterval(() => {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += ((v - 128) / 128) ** 2;
          opts.onLevel?.(Math.min(1, Math.sqrt(sum / buf.length) * 4));
        }, 120);
      }
    } catch {
      // gösterge olmadan devam
    }
  }
  rec.onstop = () => {
    clearTimeout(timer);
    if (levelTimer) clearInterval(levelTimer);
    audioCtx?.close().catch(() => undefined);
    stream.getTracks().forEach((tr) => tr.stop());
    opts.onDone(chunks.length ? new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' }) : null);
  };
  const stop = () => {
    if (rec.state !== 'inactive') rec.stop();
  };
  rec.start(1000);
  return stop;
}
