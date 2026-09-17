// Çoklu teklif isteme (Faz 3, Adım 1) seçim kipi. Ürün listesi ve takip
// edilenler ekranı aynı kipi kullansın diye mantık burada.
//
// Kural (sunucuyla aynı): aynı firmadan yalnızca İLK seçilen ürün için istek
// gider, en az 2 ve en çok 10 FARKLI FİRMA seçilebilir. Bu yüzden sayılan şey
// ürün değil firmadır.
import { useCallback, useMemo, useState } from 'react';
import { MANY_RFQ_COMPANIES, MAX_RFQ_COMPANIES } from '../../api/client';
import type { StockUnit } from '../products/catalog';

// Forma taşınan ürün özeti: form ekranı id'lerden yeniden veri çekmesin.
export interface RfqSelectionItem {
  id: string;
  code: string;
  companyId: string;
  companyName: string;
  stockUnit: StockUnit;
  type: string;
}

export function companyCountOf(items: RfqSelectionItem[]): number {
  return new Set(items.map((i) => i.companyId)).size;
}

export function useRfqSelection() {
  const [active, setActive] = useState(false);
  const [items, setItems] = useState<RfqSelectionItem[]>([]);
  // Sınıra takılınca gösterilen kısa uyarı (şeritte kırmızı satır).
  const [limitNote, setLimitNote] = useState<string | null>(null);

  const start = useCallback(() => {
    setActive(true);
    setItems([]);
    setLimitNote(null);
  }, []);

  const cancel = useCallback(() => {
    setActive(false);
    setItems([]);
    setLimitNote(null);
  }, []);

  const toggle = useCallback((item: RfqSelectionItem) => {
    setLimitNote(null);
    setItems((prev) => {
      if (prev.some((i) => i.id === item.id)) return prev.filter((i) => i.id !== item.id);
      const next = [...prev, item];
      if (companyCountOf(next) > MAX_RFQ_COMPANIES) {
        setLimitNote(`En çok ${MAX_RFQ_COMPANIES} firmaya sorabilirsiniz.`);
        return prev;
      }
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const selectedIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const companyCount = useMemo(() => companyCountOf(items), [items]);
  // Aynı firmadan birden çok ürün seçildi mi (şeritte küçük not).
  const hasDuplicateCompany = items.length > companyCount;
  const manyCompanies = companyCount > MANY_RFQ_COMPANIES;

  return {
    active,
    items,
    selectedIds,
    companyCount,
    hasDuplicateCompany,
    manyCompanies,
    limitNote,
    start,
    cancel,
    toggle,
    remove,
  };
}

export type RfqSelection = ReturnType<typeof useRfqSelection>;
