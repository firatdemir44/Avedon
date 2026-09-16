import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// "Hareketi azalt" açıkken animasyonlar durur (iskelet, asistan avatarı).
// Tek yerde durduğu için her bileşen aynı davranır.
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduce(value);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduce;
}
