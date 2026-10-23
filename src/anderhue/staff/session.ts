import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { PracticeArea } from './catalog';

export interface StaffSessionValue {
  session: Session;
  userId: string;
  email: string;
  role: string;
  roleLabel: string;
  signOut: () => Promise<void>;
}

export const StaffSessionContext = createContext<StaffSessionValue | null>(null);

export function useStaffSession(): StaffSessionValue {
  const value = useContext(StaffSessionContext);
  if (!value) throw new Error('useStaffSession must be used inside the staff workspace');
  return value;
}

export interface StaffUiValue {
  openNewFile: (area?: PracticeArea) => void;
  openSearch: () => void;
}

export const StaffUiContext = createContext<StaffUiValue>({
  openNewFile: () => undefined,
  openSearch: () => undefined,
});

export function useStaffUi(): StaffUiValue {
  return useContext(StaffUiContext);
}
