// İngilizce sözlük: Türkçe kaynak metin → İngilizce. Alanlara bölünmüş dosyalar birleştirilir
// (paralel çalışmada çakışma olmasın diye her alan kendi dosyasını düzenler).
import { common } from './common';
import { components } from './components';
import { features } from './features';
import { account } from './account';
import { social } from './social';
import { catalog } from './catalog';

export const EN: Record<string, string> = {
  ...components,
  ...features,
  ...account,
  ...social,
  ...catalog,
  // Ortak terimler en sonda: tek ve tutarlı karşılık.
  ...common,
};
