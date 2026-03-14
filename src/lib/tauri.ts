import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  AppSettings,
  ChatMessage,
  Provider,
  Session,
  SessionSummary,
  StreamToken,
  StreamChatResult,
} from '../types';

// Keychain commands
export async function saveApiKey(service: string, apiKey: string): Promise<void> {
  return invoke('save_api_key', { service, apiKey });
}

export async function getApiKey(service: string): Promise<string | null> {
  return invoke('get_api_key', { service });
}

export async function deleteApiKey(service: string): Promise<void> {
  return invoke('delete_api_key', { service });
}

export async function hasApiKey(service: string): Promise<boolean> {
  return invoke('has_api_key', { service });
}

// Streaming chat
export async function streamChat(
  provider: Provider,
  model: string,
  messages: ChatMessage[],
  systemPrompt: string | null,
  apiKey: string,
  streamId: string,
  webSearchEnabled: boolean = false,
): Promise<StreamChatResult> {
  return invoke('stream_chat', {
    provider,
    model,
    messages,
    systemPrompt,
    apiKey,
    streamId,
    webSearchEnabled,
  });
}

export function onStreamToken(
  streamId: string,
  callback: (token: StreamToken) => void,
): Promise<UnlistenFn> {
  return listen<StreamToken>(`stream-token-${streamId}`, (event) => {
    callback(event.payload);
  });
}

// Session commands
export async function saveSession(
  session: Session,
  customPath?: string | null,
): Promise<void> {
  return invoke('save_session', { session, customPath: customPath ?? null });
}

export async function loadSession(
  sessionId: string,
  customPath?: string | null,
): Promise<Session> {
  return invoke('load_session', { sessionId, customPath: customPath ?? null });
}

export async function listSessions(
  customPath?: string | null,
): Promise<SessionSummary[]> {
  return invoke('list_sessions', { customPath: customPath ?? null });
}

export async function deleteSession(
  sessionId: string,
  customPath?: string | null,
): Promise<void> {
  return invoke('delete_session', { sessionId, customPath: customPath ?? null });
}

export async function getDefaultSessionsPath(): Promise<string> {
  return invoke('get_default_sessions_path');
}

// Settings commands
export async function loadSettings(): Promise<AppSettings> {
  return invoke('load_settings');
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke('save_settings', { settings });
}

// Telegram bot commands
export async function startTelegramBot(token: string): Promise<void> {
  return invoke('start_telegram_bot', { token });
}

export async function stopTelegramBot(): Promise<void> {
  return invoke('stop_telegram_bot');
}

export async function getTelegramStatus(): Promise<{ running: boolean }> {
  return invoke('get_telegram_status');
}
