'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { LandingAuthDialog, type LandingAuthMode } from './LandingAuthDialog';

const LandingAuthContext = createContext<((mode: LandingAuthMode) => void) | null>(null);

export function LandingAuthProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<LandingAuthMode | null>(null);

  return (
    <LandingAuthContext.Provider value={setMode}>
      {children}
      <LandingAuthDialog mode={mode} onModeChange={setMode} onClose={() => setMode(null)} />
    </LandingAuthContext.Provider>
  );
}

export function LandingAuthButton({
  mode,
  className,
  children,
}: {
  mode: LandingAuthMode;
  className?: string;
  children: ReactNode;
}) {
  const openDialog = useContext(LandingAuthContext);
  if (!openDialog) {
    throw new Error('LandingAuthButton must be used inside LandingAuthProvider');
  }

  return (
    <button
      type="button"
      className={className}
      aria-haspopup="dialog"
      aria-controls="landing-auth-dialog"
      onClick={() => openDialog(mode)}
    >
      {children}
    </button>
  );
}