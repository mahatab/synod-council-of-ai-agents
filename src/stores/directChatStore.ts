import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
  DirectChatAgent,
  DirectChatMessage,
  DirectChatState,
  ChatMessage,
  Provider,
} from '../types';
import * as tauri from '../lib/tauri';

interface DirectChatStoreState {
  state: DirectChatState;
  currentStreamContent: string;
  error: string | null;

  sendMessage: (
    message: string,
    agent: DirectChatAgent,
    previousMessages: DirectChatMessage[],
    getApiKey: (service: string) => Promise<string | null>,
    onMessageComplete: (msg: DirectChatMessage) => void,
    webSearchEnabled?: boolean,
  ) => Promise<void>;

  reset: () => void;
}

export const useDirectChatStore = create<DirectChatStoreState>((set) => ({
  state: 'idle',
  currentStreamContent: '',
  error: null,

  sendMessage: async (message, agent, previousMessages, getApiKey, onMessageComplete, webSearchEnabled = false) => {
    set({ state: 'streaming', currentStreamContent: '', error: null });

    try {
      const apiKey = await getApiKey(`com.council-of-ai-agents.${agent.provider}`);
      if (!apiKey) {
        set({ state: 'error', error: `No API key found for ${agent.displayName} (${agent.provider})` });
        return;
      }

      const messages: ChatMessage[] = previousMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      messages.push({ role: 'user', content: message });

      const streamId = uuidv4();
      const unlisten = await tauri.onStreamToken(streamId, (token) => {
        if (!token.done && !token.error) {
          set((s) => ({
            currentStreamContent: s.currentStreamContent + token.token,
          }));
        }
      });

      const result = await tauri.streamChat(
        agent.provider as Provider,
        agent.model,
        messages,
        null,
        apiKey,
        streamId,
        webSearchEnabled,
      );

      unlisten();

      const assistantMessage: DirectChatMessage = {
        role: 'assistant',
        content: result.content,
        timestamp: new Date().toISOString(),
        usage: result.usage,
      };

      onMessageComplete(assistantMessage);
      set({ state: 'idle', currentStreamContent: '' });
    } catch (err) {
      set({ state: 'error', error: `Failed to get response: ${err}`, currentStreamContent: '' });
    }
  },

  reset: () => {
    set({ state: 'idle', currentStreamContent: '', error: null });
  },
}));
