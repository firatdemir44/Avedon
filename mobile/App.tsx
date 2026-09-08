import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { RegistrationProvider } from './src/context/RegistrationContext';
import { SessionProvider } from './src/context/SessionContext';

export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <RegistrationProvider>
          <RootNavigator />
          <StatusBar style="auto" />
        </RegistrationProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
