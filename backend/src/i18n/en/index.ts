// Sunucu İngilizce sözlüğü: Türkçe metin → İngilizce. Alan dosyaları birleştirilir.
import { server } from './server';
import { exportTexts } from './export';
import { labels } from './labels';
import { skillTexts } from './skills';

export const EN: Record<string, string> = {
  ...server,
  ...labels,
  ...exportTexts,
  ...skillTexts,
};
