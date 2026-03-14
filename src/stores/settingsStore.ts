import { create } from 'zustand';
import type { AppMode, AppSettings, ThemeMode } from '../types';
import * as tauri from '../lib/tauri';
import { applyTheme, watchSystemTheme } from '../lib/theme';

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  loading: boolean;
  appMode: AppMode;

  loadSettings: () => Promise<void>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  setTheme: (theme: ThemeMode) => Promise<void>;
  setAppMode: (mode: AppMode) => void;
}

const defaultSettings: AppSettings = {
  councilModels: [],
  masterModel: { provider: 'anthropic', model: 'claude-opus-4-6' },
  systemPromptMode: 'upfront',
  discussionDepth: 'thorough',
  discussionStyle: 'sequential',
  theme: 'system',
  cursorStyle: 'orbit',
  sessionSavePath: null,
  setupCompleted: false,
  telegramEnabled: false,
  internetAccessEnabled: false,
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultSettings,
  loaded: false,
  loading: false,
  appMode: 'council' as AppMode,

  loadSettings: async () => {
    set({ loading: true });
    try {
      const loaded = await tauri.loadSettings();
      const settings = { ...defaultSettings, ...loaded };
      set({ settings, loaded: true, loading: false });
      applyTheme(settings.theme);

      // Watch for system theme changes
      if (settings.theme === 'system') {
        watchSystemTheme(() => applyTheme('system'));
      }
    } catch {
      set({ loaded: true, loading: false });
      applyTheme('system');
    }
  },

  updateSettings: async (partial) => {
    const current = get().settings;
    const updated = { ...current, ...partial };
    set({ settings: updated });
    await tauri.saveSettings(updated);
  },

  setTheme: async (theme) => {
    applyTheme(theme);
    const current = get().settings;
    const updated = { ...current, theme };
    set({ settings: updated });
    await tauri.saveSettings(updated);
  },

  setAppMode: (mode) => {
    set({ appMode: mode });
  },
}));
