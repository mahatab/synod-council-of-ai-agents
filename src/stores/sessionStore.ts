import { create } from 'zustand';
import type { Session, SessionSummary } from '../types';
import * as tauri from '../lib/tauri';

interface SessionState {
  sessions: SessionSummary[];
  activeSession: Session | null;
  loading: boolean;
  error: string | null;

  loadSessions: (customPath?: string | null) => Promise<void>;
  createSession: (session: Session) => void;
  setActiveSession: (session: Session | null) => void;
  loadAndSetSession: (sessionId: string, customPath?: string | null) => Promise<void>;
  saveCurrentSession: (customPath?: string | null) => Promise<void>;
  updateActiveSession: (partial: Partial<Session>) => void;
  deleteSession: (sessionId: string, customPath?: string | null) => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSession: null,
  loading: false,
  error: null,

  loadSessions: async (customPath) => {
    set({ loading: true, error: null });
    try {
      const sessions = await tauri.listSessions(customPath);
      set({ sessions, loading: false });
    } catch (err) {
      console.error('Failed to load sessions:', err);
      set({ loading: false, error: `Failed to load sessions: ${err}` });
    }
  },

  createSession: (session) => {
    set({ activeSession: session, error: null });
  },

  setActiveSession: (session) => {
    set({ activeSession: session, error: null });
  },

  loadAndSetSession: async (sessionId, customPath) => {
    set({ loading: true, error: null });
    try {
      const session = await tauri.loadSession(sessionId, customPath);
      set({ activeSession: session, loading: false });
    } catch (err) {
      console.error('Failed to load session:', err);
      set({ loading: false, error: `Failed to load session: ${err}` });
    }
  },

  saveCurrentSession: async (customPath) => {
    const session = get().activeSession;
    if (!session) return;

    const updated = { ...session, updatedAt: new Date().toISOString() };
    set({ activeSession: updated });

    try {
      await tauri.saveSession(updated, customPath);
      // Refresh the session list
      const sessions = await tauri.listSessions(customPath);
      set({ sessions });
    } catch (err) {
      console.error('Failed to save session:', err);
      set({ error: `Failed to save session: ${err}` });
    }
  },

  updateActiveSession: (partial) => {
    const current = get().activeSession;
    if (!current) return;
    set({ activeSession: { ...current, ...partial } });
  },

  deleteSession: async (sessionId, customPath) => {
    set({ error: null });
    try {
      await tauri.deleteSession(sessionId, customPath);
      const state = get();
      if (state.activeSession?.id === sessionId) {
        set({ activeSession: null });
      }
      const sessions = await tauri.listSessions(customPath);
      set({ sessions });
    } catch (err) {
      console.error('Failed to delete session:', err);
      set({ error: `Failed to delete session: ${err}` });
    }
  },
}));
