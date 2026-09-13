import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { fetchUserProfile, type PublicUserProfile } from '../../api/client';

// Hem kendi profil sekmesi hem de başkasının profil ekranı aynı veriyi çekiyor;
// bağlantı durumu sorgusu sadece başkasının profilinde gerektiği için burada yok.
export function useUserProfile(userId: string) {
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetchUserProfile(userId)
      .then(({ user }) => setProfile(user))
      .catch((err) => setError(err instanceof Error ? err.message : 'Profil alınamadı'))
      .finally(() => setLoading(false));
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  return { profile, loading, error, reload };
}
