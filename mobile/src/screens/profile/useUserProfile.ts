import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { fetchUserProfile, type PublicUserProfile } from '../../api/client';
import { tr } from '../../i18n';
import { friendlyMessage } from '../../components/StateView';

// Hem kendi profil sekmesi hem de başkasının profil ekranı aynı veriyi çekiyor;
// bağlantı durumu sorgusu sadece başkasının profilinde gerektiği için burada yok.
export function useUserProfile(userId: string) {
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // İlk yüklemeden sonra (sekme değişimi, bağlantı kurma sonrası) iskelete
  // dönmeden sessizce yenileniyor.
  const hasProfileRef = useRef(false);

  const reload = useCallback(() => {
    if (!hasProfileRef.current) setLoading(true);
    setError(null);
    return fetchUserProfile(userId)
      .then(({ user }) => {
        hasProfileRef.current = true;
        setProfile(user);
      })
      .catch((err) => setError(friendlyMessage(err, tr('Profil alınamadı'))))
      .finally(() => setLoading(false));
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  return { profile, loading, error, reload };
}
