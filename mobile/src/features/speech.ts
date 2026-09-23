import { Platform } from 'react-native';

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
export const canSpeak = () => Platform.OS === 'web' && typeof window !== 'undefined' && 'speechSynthesis' in window;

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
    r.lang = 'tr-TR';
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

// Asistan kişiliğine göre ses: İpek kadın, Mert erkek. Tarayıcının Türkçe sesleri arasında
// adından cinsiyeti anlaşılan varsa o seçilir; yoksa aynı sesle ton (pitch) ayarlanır.
export type VoicePersona = 'ipek' | 'mert';
let persona: VoicePersona = 'ipek';
export const setVoicePersona = (p: VoicePersona) => {
  persona = p;
};
const FEMALE = /(yelda|filiz|seda|emel|female|kad[ıi]n|woman|zira|google t[üu]rk[çc]e)/i;
const MALE = /(tolga|cem|mehmet|ahmet|male|erkek|man\b)/i;
function pickVoice(): { voice: SpeechSynthesisVoice | null; pitch: number } {
  const tr = window.speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('tr'));
  const want = persona === 'mert' ? MALE : FEMALE;
  const match = tr.find((v) => want.test(v.name) && !(persona === 'mert' && FEMALE.test(v.name)));
  if (match) return { voice: match, pitch: 1 };
  // Tek Türkçe ses varsa ton farkıyla ayırt edilir.
  return { voice: tr[0] ?? null, pitch: persona === 'mert' ? 0.75 : 1.15 };
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
  window.speechSynthesis.cancel();
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
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(plain(text));
  u.lang = 'tr-TR';
  const { voice, pitch } = pickVoice();
  if (voice) u.voice = voice;
  u.pitch = pitch;
  u.rate = 1;
  u.onend = () => {
    if (speakingId === id) {
      speakingId = null;
      emit();
    }
  };
  u.onerror = u.onend;
  speakingId = id;
  emit();
  window.speechSynthesis.speak(u);
}

// Kayıt yolu (2026-09-23): tarayıcı tanıması telefonda kısa sürede kapandığı için ses kaydedilir,
// kullanıcı durdurunca sunucuda (Whisper) yazıya çevrilir. En çok MAX_REC_MS kayıt.
const MAX_REC_MS = 120_000;
export const canRecord = () =>
  Platform.OS === 'web' && typeof window !== 'undefined' && typeof (window as unknown as { MediaRecorder?: unknown }).MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export async function startRecording(opts: { onDone: (audio: Blob | null) => void; onError: (e: ListenError) => void }): Promise<() => void> {
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
  rec.onstop = () => {
    clearTimeout(timer);
    stream.getTracks().forEach((tr) => tr.stop());
    opts.onDone(chunks.length ? new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' }) : null);
  };
  const stop = () => {
    if (rec.state !== 'inactive') rec.stop();
  };
  rec.start(1000);
  return stop;
}
