import { Platform } from 'react-native';

// Web'de (telefon tarayıcısı / ana ekrana eklenmiş PWA) aşağı çekerek yenileme (Fırat 2026-09-23:
// "sayfayı yenilemek için kapatıp açmak gerekiyor"). RN'in RefreshControl'ü web'de çalışmaz;
// tarayıcının kendi çekerek yenilemesi de standalone kipte kapalıdır. Burada: içerik en üstteyken
// parmakla aşağı çekilince küçük bir gösterge iner, eşik aşılıp bırakılınca sayfa yeniden yüklenir
// (oturum localStorage'da, giriş korunur). Native'de bir şey yapmaz (ekranlar RefreshControl kullanır).
const THRESHOLD = 80;
const MAX_PULL = 120;

function isScrolledToTop(target: EventTarget | null): boolean {
  let el = target as HTMLElement | null;
  while (el && el !== document.body) {
    const style = getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) {
      return el.scrollTop <= 0;
    }
    el = el.parentElement;
  }
  return (document.scrollingElement?.scrollTop ?? 0) <= 0;
}

export function installWebPullToRefresh(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  try {
    const root = document.documentElement;
    const indicator = document.createElement('div');
    indicator.setAttribute('aria-hidden', 'true');
    // Renkler tokens.css değişkenlerinden (data-theme ile açık/koyu).
    indicator.style.cssText =
      'position:fixed;left:50%;top:0;transform:translate(-50%,-48px);width:36px;height:36px;border-radius:999px;' +
      'background:var(--surface-1,#fff);border:1px solid var(--line,#ddd8d0);box-shadow:var(--shadow-raised,0 2px 8px rgba(0,0,0,.12));' +
      'display:flex;align-items:center;justify-content:center;z-index:9999;pointer-events:none;transition:transform .15s ease;';
    indicator.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand,#1f3a5f)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>';
    document.body.appendChild(indicator);

    let startY: number | null = null;
    let pulling = false;
    let distance = 0;

    const reset = () => {
      startY = null;
      pulling = false;
      distance = 0;
      indicator.style.transform = 'translate(-50%,-48px)';
      indicator.style.transition = 'transform .15s ease';
    };

    root.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length !== 1) return;
        // Yazı alanında ya da kaydırılan bir listenin ortasında değilsek başla.
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
        if (!isScrolledToTop(e.target)) return;
        startY = e.touches[0].clientY;
        pulling = false;
        distance = 0;
      },
      { passive: true }
    );

    root.addEventListener(
      'touchmove',
      (e) => {
        if (startY == null || e.touches.length !== 1) return;
        const dy = e.touches[0].clientY - startY;
        if (dy <= 0) {
          if (pulling) reset();
          return;
        }
        if (!isScrolledToTop(e.target)) {
          reset();
          return;
        }
        pulling = true;
        distance = Math.min(dy * 0.5, MAX_PULL);
        indicator.style.transition = 'none';
        indicator.style.transform = `translate(-50%, ${distance - 48}px) rotate(${distance * 3}deg)`;
      },
      { passive: true }
    );

    const finish = () => {
      if (!pulling) {
        reset();
        return;
      }
      if (distance >= THRESHOLD * 0.5) {
        indicator.style.transition = 'transform .15s ease';
        indicator.style.transform = 'translate(-50%, 16px)';
        // Kısa gecikme: gösterge yerine otursun, sonra yenile.
        window.setTimeout(() => window.location.reload(), 120);
        return;
      }
      reset();
    };
    root.addEventListener('touchend', finish, { passive: true });
    root.addEventListener('touchcancel', reset, { passive: true });
  } catch {
    // Sessiz: yenileme kolaylığı olmasa da uygulama çalışır.
  }
}
