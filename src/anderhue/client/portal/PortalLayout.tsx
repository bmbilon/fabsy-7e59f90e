import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { ApiError, defaultErrorMessage, portal } from '../api';
import { captureTokenFromLocation, clearStoredToken, loadStoredToken, rememberToken } from '../lib/token';
import { PortalContext, type PortalContextValue, type PortalNotice, type PortalSessionState } from './PortalContext';

interface AuthState {
  token: string | null;
  remembered: boolean;
  notice: PortalNotice;
}

function toApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError(defaultErrorMessage(500), 500);
}

/** Holds the portal token and the session for /files and /files/:area/:id. */
export default function PortalLayout() {
  const navigate = useNavigate();
  const [auth, setAuth] = useState<AuthState>(() => ({ ...loadStoredToken(), notice: null }));
  const [session, setSession] = useState<PortalSessionState>(() => ({ status: auth.token ? 'loading' : 'idle', data: null, error: null }));
  const requestId = useRef(0);

  const expire = useCallback(() => {
    requestId.current += 1;
    clearStoredToken();
    setAuth({ token: null, remembered: false, notice: 'expired' });
    setSession({ status: 'idle', data: null, error: null });
  }, []);

  const handleError = useCallback((error: unknown) => {
    const apiError = toApiError(error);
    if (apiError.status === 401) expire();
    return apiError;
  }, [expire]);

  const loadSession = useCallback(async (token: string, quiet = false) => {
    const id = ++requestId.current;
    if (!quiet) setSession(previous => ({ ...previous, status: 'loading', error: null }));
    try {
      const data = await portal.session(token);
      if (id === requestId.current) setSession({ status: 'ready', data, error: null });
    } catch (error) {
      if (id !== requestId.current) return;
      const apiError = handleError(error);
      if (apiError.status === 401) return;
      setSession(previous => ({ status: quiet && previous.data ? 'ready' : 'error', data: previous.data, error: apiError }));
    }
  }, [handleError]);

  useEffect(() => {
    // A new token may belong to another client: never show the previous session while loading.
    setSession({ status: auth.token ? 'loading' : 'idle', data: null, error: null });
    if (auth.token) void loadSession(auth.token);
  }, [auth.token, loadSession]);

  // A link pasted into a tab that already has the portal open only changes the hash.
  useEffect(() => {
    const onHash = () => {
      const token = captureTokenFromLocation();
      if (token) setAuth({ ...loadStoredToken(), token, notice: null });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const reloadSession = useCallback((quiet = false) => {
    if (auth.token) void loadSession(auth.token, quiet);
  }, [auth.token, loadSession]);

  const setRemembered = useCallback((value: boolean) => {
    if (auth.token) rememberToken(auth.token, value);
    setAuth(previous => ({ ...previous, remembered: value }));
  }, [auth.token]);

  const signOut = useCallback(() => {
    requestId.current += 1;
    clearStoredToken();
    setAuth({ token: null, remembered: false, notice: 'signed_out' });
    setSession({ status: 'idle', data: null, error: null });
    navigate('/files');
  }, [navigate]);

  const value = useMemo<PortalContextValue>(() => ({
    token: auth.token,
    remembered: auth.remembered,
    notice: auth.notice,
    session,
    reloadSession,
    setRemembered,
    signOut,
    handleError,
  }), [auth, session, reloadSession, setRemembered, signOut, handleError]);

  return (
    <PortalContext.Provider value={value}>
      <Outlet />
    </PortalContext.Provider>
  );
}
