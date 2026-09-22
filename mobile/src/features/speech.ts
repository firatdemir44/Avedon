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
export function startListening(opts: { onText: (text: string, final: boolean) => void; onEnd: () => void; onError: (e: ListenError) => void }): () => void {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    opts.onError('other');
    opts.onEnd();
    return () => undefined;
  }
  const rec = new Ctor();
  rec.lang = 'tr-TR';
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = '';
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    opts.onText((finalText + interim).trim(), !interim);
  };
  rec.onerror = (e) => {
    opts.onError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'not-allowed' : e.error === 'no-speech' ? 'no-speech' : e.error === 'network' ? 'network' : 'other');
  };
  rec.onend = () => opts.onEnd();
  try {
    rec.start();
  } catch {
    opts.onError('other');
    opts.onEnd();
  }
  return () => {
    try {
      rec.stop();
    } catch {
      // sessiz
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
