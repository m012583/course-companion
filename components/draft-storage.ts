import { useCallback, useEffect, useState, type SetStateAction } from 'react';
import type { Note } from '@/lib/knowledge';
const KEY = 'course-companion-note-drafts-v1';
export function useNoteDrafts() {
  const [state, setState] = useState<{
    drafts: Note[];
    active: Note | null;
    ready: boolean;
  }>({ drafts: [], active: null, ready: false });
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const stored = JSON.parse(localStorage.getItem(KEY) || '[]');
        if (
          !Array.isArray(stored) ||
          stored.some(
            (n) =>
              !n ||
              typeof n.id !== 'string' ||
              typeof n.title !== 'string' ||
              typeof n.text !== 'string' ||
              typeof n.course !== 'string',
          )
        )
          throw new Error();
        setState({ drafts: stored, active: null, ready: true });
      } catch {
        setError('无法读取本机草稿，请勿清理浏览器数据。');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!state.ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state.drafts));
      queueMicrotask(() => setError(''));
    } catch {
      queueMicrotask(() => setError('草稿暂存失败，请先复制正文到安全位置。'));
    }
  }, [state]);
  useEffect(() => {
    if (!error) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [error]);
  function setDraftNote(value: SetStateAction<Note | null>) {
    setState((current) => {
      const next = typeof value === 'function' ? value(current.active) : value;
      return {
        ...current,
        active: next,
        drafts: next
          ? [next, ...current.drafts.filter((n) => n.id !== next.id)]
          : current.drafts,
      };
    });
  }
  function discard(id: string) {
    setState((current) => ({
      ...current,
      active: null,
      drafts: current.drafts.filter((n) => n.id !== id),
    }));
  }
  const hydrateDrafts = useCallback(
    (incoming: Note[], replace = false) =>
      setState((current) => ({
        ...current,
        active: replace ? null : current.active,
        drafts: replace
          ? incoming
          : [
              ...new Map(
                [...incoming, ...current.drafts].map((n) => [n.id, n]),
              ).values(),
            ],
      })),
    [],
  );
  return {
    hydrateDrafts,
    ready: state.ready,
    draftNote: state.active,
    setDraftNote,
    drafts: state.drafts,
    discard,
    error,
  };
}
