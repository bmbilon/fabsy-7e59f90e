import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { torontoToday, type PracticeArea } from './catalog';
import {
  fetchBoard, fetchClientNotices, fetchFile, fetchPractice, fetchRecentEvents, staffKeys, type RecentEvent,
} from './api';
import {
  AREA_LIST, compareUrgency, computeSignals, fileKey, toStaffFile, type FileWithSignals, type NoticeRow,
} from './model';
import { useStaffSession } from './session';

const LIVE = { refetchInterval: 30_000, refetchOnWindowFocus: true, staleTime: 15_000, retry: 1 } as const;

/** Re-renders on an interval (for countdowns and the Toronto date line). */
export function useNow(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, enabled]);
  return now;
}

export function useLocalStorageState<T extends string>(key: string, initial: T, allowed: readonly T[]): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key) as T | null;
      return stored && allowed.includes(stored) ? stored : initial;
    } catch {
      return initial;
    }
  });
  const update = useCallback((next: T) => {
    setValue(next);
    try { window.localStorage.setItem(key, next); } catch { /* private mode */ }
  }, [key]);
  return [value, update];
}

/**
 * Form state over server values. Fields the user has not touched follow the
 * server (refetches, other staff edits); touched fields keep the user's text
 * until it matches the server again.
 */
export function useEditableForm(initial: Record<string, string>) {
  const [values, setValues] = useState<Record<string, string>>(initial);
  const touched = useRef<Set<string>>(new Set());
  const [, bump] = useState(0);

  useEffect(() => {
    setValues(current => {
      const next = { ...initial };
      for (const key of Array.from(touched.current)) {
        if ((current[key] ?? '') === (initial[key] ?? '')) touched.current.delete(key);
        else next[key] = current[key];
      }
      return next;
    });
  }, [initial]);

  const set = useCallback((key: string, value: string) => {
    touched.current.add(key);
    setValues(current => ({ ...current, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    touched.current.clear();
    setValues(initial);
    bump(count => count + 1);
  }, [initial]);

  const dirtyKeys = Object.keys(initial).filter(key => touched.current.has(key) && (values[key] ?? '') !== (initial[key] ?? ''));
  return { values, set, reset, dirtyKeys, dirty: dirtyKeys.length > 0 };
}

export function usePracticeSettings() {
  const { userId } = useStaffSession();
  return useQuery({
    queryKey: staffKeys.practice(userId),
    queryFn: fetchPractice,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

export interface AreaState {
  loading: boolean;
  error: boolean;
  fetching: boolean;
}

export interface Workspace {
  files: FileWithSignals[];
  byArea: Record<PracticeArea, FileWithSignals[]>;
  areaState: Record<PracticeArea, AreaState>;
  events: RecentEvent[];
  eventsLoading: boolean;
  eventsError: boolean;
  loading: boolean;
  error: boolean;
  fetching: boolean;
  updatedAt: number;
  today: string;
  refetch: () => void;
}

/**
 * All three boards plus recent events and client update health, combined into
 * one list of files with attention signals. Shared by the navigation counts,
 * Today, the boards and the command palette (one cache, one truth).
 */
export function useWorkspace(): Workspace {
  const { userId } = useStaffSession();
  const queryClient = useQueryClient();
  const minute = useNow(60_000);
  const today = useMemo(() => torontoToday(new Date(minute)), [minute]);
  const boards = useQueries({
    queries: AREA_LIST.map(area => ({
      queryKey: staffKeys.board(userId, area),
      queryFn: () => fetchBoard(area),
      ...LIVE,
    })),
  });
  const events = useQuery({ queryKey: staffKeys.events(userId), queryFn: fetchRecentEvents, ...LIVE });
  const notices = useQuery({ queryKey: staffKeys.noticeHealth(userId), queryFn: fetchClientNotices, ...LIVE });

  const boardData = boards.map(board => board.data);
  const files = useMemo(() => {
    const staffTouch = new Map<string, string>();
    for (const item of events.data || []) {
      if (!item.row.actor_id || !item.fileId) continue;
      const previous = staffTouch.get(item.fileId);
      if (!previous || Date.parse(item.row.at) > Date.parse(previous)) staffTouch.set(item.fileId, item.row.at);
    }
    const latestNotice = new Map<string, NoticeRow>();
    for (const notice of notices.data || []) {
      if (!notice.area || !notice.case_id || notice.status === 'cancelled' || notice.status === 'superseded') continue;
      const key = fileKey(notice.area, notice.case_id);
      if (!latestNotice.has(key)) latestNotice.set(key, notice);
    }
    const all: FileWithSignals[] = [];
    AREA_LIST.forEach((area, index) => {
      for (const row of boardData[index] || []) {
        const file = toStaffFile(area, row, today);
        all.push({
          ...file,
          signals: computeSignals(file, {
            today,
            staffTouchAt: staffTouch.get(file.id) || null,
            latestClientNotice: latestNotice.get(file.key) || null,
          }),
        });
      }
    });
    return all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...boardData, events.data, notices.data, today]);

  const byArea = useMemo(() => {
    const grouped: Record<PracticeArea, FileWithSignals[]> = { ltb: [], traffic: [], general: [] };
    for (const file of files) grouped[file.area].push(file);
    return grouped;
  }, [files]);

  const areaState = useMemo(() => {
    const state = {} as Record<PracticeArea, AreaState>;
    AREA_LIST.forEach((area, index) => {
      const query = boards[index];
      state[area] = { loading: query.isPending, error: query.isError, fetching: query.isFetching };
    });
    return state;
  }, [boards]);

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: staffKeys.boards(userId) });
    void queryClient.invalidateQueries({ queryKey: staffKeys.events(userId) });
    void queryClient.invalidateQueries({ queryKey: staffKeys.noticeHealth(userId) });
  }, [queryClient, userId]);

  return {
    files,
    byArea,
    areaState,
    events: events.data || [],
    eventsLoading: events.isPending,
    eventsError: events.isError,
    loading: boards.some(board => board.isPending),
    error: boards.some(board => board.isError),
    fetching: boards.some(board => board.isFetching) || events.isFetching || notices.isFetching,
    updatedAt: Math.max(0, ...boards.map(board => board.dataUpdatedAt || 0)),
    today,
    refetch,
  };
}

export function useAttentionQueue(files: FileWithSignals[]) {
  return useMemo(() => files.filter(file => file.signals.attention).sort(compareUrgency), [files]);
}

export function useFileDetail(area: PracticeArea, id: string, enabled: boolean) {
  const { userId } = useStaffSession();
  return useQuery({
    queryKey: staffKeys.file(userId, area, id),
    queryFn: () => fetchFile(area, id),
    enabled,
    ...LIVE,
  });
}

/** Refresh one file and everything derived from it after a write. */
export function useRefreshAfterWrite() {
  const { userId } = useStaffSession();
  const queryClient = useQueryClient();
  return useCallback((area?: PracticeArea, id?: string) => {
    if (area && id) void queryClient.invalidateQueries({ queryKey: staffKeys.file(userId, area, id) });
    else void queryClient.invalidateQueries({ queryKey: staffKeys.files(userId) });
    if (area) void queryClient.invalidateQueries({ queryKey: staffKeys.board(userId, area) });
    else void queryClient.invalidateQueries({ queryKey: staffKeys.boards(userId) });
    void queryClient.invalidateQueries({ queryKey: staffKeys.events(userId) });
    void queryClient.invalidateQueries({ queryKey: staffKeys.noticeHealth(userId) });
  }, [queryClient, userId]);
}
