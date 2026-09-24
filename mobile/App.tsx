import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
} from '@expo-google-fonts/ibm-plex-sans';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { RegistrationProvider } from './src/context/RegistrationContext';
import { SessionProvider } from './src/context/SessionContext';
import { ThemeProvider } from './src/theme/ThemeContext';
import { I18nProvider, useI18n } from './src/i18n';
import { installWebPullToRefresh } from './src/features/webPullToRefresh';
import { captureInviteCodeFromUrl } from './src/features/invites/storedCode';
import { ensureManifestLink } from './src/features/push/webPush';

// Yazı tipleri yüklenene kadar açılış ekranı dursun; yoksa ilk karede sistem
// yazı tipi görünüp Plex'e sıçrardı.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  // Anahtar adları src/theme/index.ts içindeki `fonts` değerleriyle aynı olmalı.
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });
  // Yazı tipi yüklenemezse uygulama yine açılır, metinler sistem yazı tipiyle görünür.
  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // Davet bağlantısıyla açıldıysa (`?davet=KOD`) kodu cihaza yaz; kayıt akışı
  // oradan okuyup "Davet kodu" alanını dolduruyor (Faz 2, Adım 4).
  useEffect(() => {
    void captureInviteCodeFromUrl();
  }, []);

  // Web'de anlık bildirim için gereken manifest/ana ekran etiketleri (iOS'ta
  // Push yalnızca ana ekrana eklenmiş uygulamada çalışıyor). Native'de sessiz.
  useEffect(() => {
    ensureManifestLink();
    // Web'de aşağı çekerek yenileme (native'de ekranlar RefreshControl kullanır).
    installWebPullToRefresh();
  }, []);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SessionProvider>
          <RegistrationProvider>
            <LocalizedNavigator />
          </RegistrationProvider>
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

// Dil değişince gezinti ağacı yeniden kurulur; bileşen dışındaki tr() çağrıları da yeni dille çalışır.
function LocalizedNavigator() {
  const { lang, ready } = useI18n();
  if (!ready) return null;
  return <RootNavigator key={lang} />;
}
