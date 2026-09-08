import React, { createContext, useContext, useMemo, useState } from 'react';
import type { AccountType } from '../types';

export interface RegistrationDraft {
  accountType: AccountType | null;
  position: string;
  firstName: string;
  lastName: string;
  phone: string;
  companyName: string;
  taxId: string;
  companyCode: string;
}

const initialDraft: RegistrationDraft = {
  accountType: null,
  position: '',
  firstName: '',
  lastName: '',
  phone: '',
  companyName: '',
  taxId: '',
  companyCode: '',
};

interface RegistrationContextValue {
  draft: RegistrationDraft;
  updateDraft: (patch: Partial<RegistrationDraft>) => void;
  reset: () => void;
}

const RegistrationContext = createContext<RegistrationContextValue | undefined>(undefined);

export function RegistrationProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<RegistrationDraft>(initialDraft);

  const value = useMemo<RegistrationContextValue>(
    () => ({
      draft,
      updateDraft: (patch) => setDraft((prev) => ({ ...prev, ...patch })),
      reset: () => setDraft(initialDraft),
    }),
    [draft]
  );

  return <RegistrationContext.Provider value={value}>{children}</RegistrationContext.Provider>;
}

export function useRegistration() {
  const ctx = useContext(RegistrationContext);
  if (!ctx) throw new Error('useRegistration must be used within RegistrationProvider');
  return ctx;
}
