import { createContext, useContext } from 'react';
import type { ApiError, PortalFileSummary, PortalSessionResponse } from '../api';

export type PortalNotice = 'expired' | 'signed_out' | null;

export interface PortalSessionState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: PortalSessionResponse | null;
  error: ApiError | null;
}

export interface PortalContextValue {
  token: string | null;
  remembered: boolean;
  notice: PortalNotice;
  session: PortalSessionState;
  reloadSession: (quiet?: boolean) => void;
  setRemembered: (value: boolean) => void;
  signOut: () => void;
  /** Turns any failure into an ApiError; a 401 clears the token and shows the sign-in card. */
  handleError: (error: unknown) => ApiError;
}

export const PortalContext = createContext<PortalContextValue | null>(null);

export function usePortal(): PortalContextValue {
  const value = useContext(PortalContext);
  if (!value) throw new Error('usePortal must be used inside the portal layout');
  return value;
}

/** /files/{area}/{id}, using the internal area value like the email links. */
export function filePath(file: Pick<PortalFileSummary, 'area' | 'id'>): string {
  return `/files/${file.area}/${file.id}`;
}
