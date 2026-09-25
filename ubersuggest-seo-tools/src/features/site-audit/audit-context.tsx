import { createContext, type ReactNode, useContext } from 'react';

import type { Audit } from './types';

// Provided once at the top of the page; every card reads it via useAudit().
const AuditContext = createContext<Audit | null>(null);

export function useAudit(): Audit {
  const audit = useContext(AuditContext);
  if (!audit) {
    throw new Error('useAudit must be used inside <AuditProvider>');
  }
  return audit;
}

// Lets any control (e.g. "Recrawl website") re-run the audit.
type ReloadValue = { reload: () => void; reloading: boolean };
const ReloadContext = createContext<ReloadValue>({
  reload: () => {},
  reloading: false,
});

export function useReload(): ReloadValue {
  return useContext(ReloadContext);
}

// Wraps both contexts so the page provides the audit + reload controls in one place.
export function AuditProvider({
  audit,
  reload,
  reloading,
  children,
}: {
  audit: Audit;
  reload: () => void;
  reloading: boolean;
  children: ReactNode;
}) {
  return (
    <AuditContext.Provider value={audit}>
      <ReloadContext.Provider value={{ reload, reloading }}>
        {children}
      </ReloadContext.Provider>
    </AuditContext.Provider>
  );
}
