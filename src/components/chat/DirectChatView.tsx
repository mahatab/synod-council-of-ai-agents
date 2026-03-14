import { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Send, Bot, Globe } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import UserMessage from './UserMessage';
import ModelResponse from './ModelResponse';
import AgentPicker from './AgentPicker';
import Button from '../common/Button';
import { useDirectChatStore } from '../../stores/directChatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSessionStore } from '../../stores/sessionStore';
import { getApiKey } from '../../lib/tauri';
import { generateSessionTitle } from '../../lib/sessionTitle';
import type { DirectChatAgent, DirectChatMessage, Provider, Session } from '../../types';
import { getProviderColor } from '../../types';

export default function DirectChatView() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<DirectChatMessage[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<DirectChatAgent | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<DirectChatMessage[]>([]);

  const directChat = useDirectChatStore();
  const { settings, updateSettings } = useSettingsStore();
  const { activeSession, createSession, saveCurrentSession, updateActiveSession } =
    useSessionStore();
  const sessionLoading = useSessionStore((s) => s.loading);

  // Refs for stable access in callbacks
  const saveSessionRef = useRef(saveCurrentSession);
  const updateSessionRef = useRef(updateActiveSession);
  const settingsRef = useRef(settings);

  useEffect(() => {
    saveSessionRef.current = saveCurrentSession;
    updateSessionRef.current = updateActiveSession;
    settingsRef.current = settings;
  }, [saveCurrentSession, updateActiveSession, settings]);

  // Sync from active session (setState during render pattern)
  const activeSessionId = activeSession?.id;
  const [prevSessionId, setPrevSessionId] = useState<string | undefined>(undefined);
  if (prevSessionId !== activeSessionId) {
    setPrevSessionId(activeSessionId);
    setMessages(activeSession?.directChatMessages ?? []);
    setSelectedAgent(activeSession?.directChatAgent ?? null);
  }

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, directChat.currentStreamContent, directChat.state]);

  // Focus input when agent is selected
  useEffect(() => {
    if (selectedAgent && !activeSession) {
      inputRef.current?.focus();
    }
  }, [selectedAgent, activeSession]);

  const handleMessageComplete = useCallback((msg: DirectChatMessage) => {
    const updated = [...messagesRef.current, msg];
    messagesRef.current = updated;
    setMessages(updated);
    updateSessionRef.current({ directChatMessages: [...updated] });
    saveSessionRef.current(settingsRef.current.sessionSavePath).catch((err) => {
      console.error('Failed to auto-save direct chat:', err);
    });
  }, []);

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || !selectedAgent) return;
    if (directChat.state === 'streaming') return;

    setInput('');

    const userMessage: DirectChatMessage = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    // If no active session, create one
    if (!activeSession) {
      const session: Session = {
        id: uuidv4(),
        title: text.length > 57 ? text.slice(0, 57) + '...' : text,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userQuestion: text,
        councilConfig: {
          models: [],
          masterModel: settings.masterModel,
          systemPromptMode: settings.systemPromptMode,
        },
        discussion: [],
        sessionType: 'direct_chat',
        directChatAgent: selectedAgent,
        directChatMessages: [userMessage],
      };

      createSession(session);
      setMessages([userMessage]);
      messagesRef.current = [userMessage];

      try {
        await saveCurrentSession(settings.sessionSavePath);
      } catch (err) {
        console.error('Failed to save initial direct chat session:', err);
      }

      // Generate title in background
      generateSessionTitle(text, settings).then((title) => {
        if (title) {
          updateSessionRef.current({ title });
          saveSessionRef.current(settingsRef.current.sessionSavePath).catch(console.error);
        }
      });

      // Send the message
      await directChat.sendMessage(
        text,
        selectedAgent,
        [],
        getApiKey,
        handleMessageComplete,
        settings.internetAccessEnabled,
      );
    } else {
      // Existing session — add user message and send
      const updatedMessages = [...messagesRef.current, userMessage];
      messagesRef.current = updatedMessages;
      setMessages(updatedMessages);
      updateActiveSession({ directChatMessages: [...updatedMessages] });
      saveCurrentSession(settings.sessionSavePath).catch(console.error);

      await directChat.sendMessage(
        text,
        selectedAgent,
        messagesRef.current.filter((m) => m !== userMessage),
        getApiKey,
        handleMessageComplete,
        settings.internetAccessEnabled,
      );
    }
  };

  const handleAgentSelect = (agent: DirectChatAgent) => {
    setSelectedAgent(agent);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isStreaming = directChat.state === 'streaming';

  // No agent selected and no active session → show agent picker
  if (!selectedAgent && !activeSession) {
    return <AgentPicker onSelect={handleAgentSelect} />;
  }

  const agentColor = selectedAgent
    ? getProviderColor(selectedAgent.provider as Provider)
    : undefined;

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 && !sessionLoading ? (
          <div className="flex flex-col items-center justify-center h-full px-6">
            <div className="text-center">
              {selectedAgent && (
                <>
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                    style={{ backgroundColor: agentColor + '20' }}
                  >
                    <Bot size={24} style={{ color: agentColor }} />
                  </div>
                  <p className="text-lg font-medium text-[var(--color-text-primary)] mb-1">
                    {selectedAgent.displayName}
                  </p>
                  <p className="text-sm text-[var(--color-text-tertiary)]">
                    Start a conversation below
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto py-6">
            <AnimatePresence>
              {messages.map((msg, i) => {
                if (msg.role === 'user') {
                  return <UserMessage key={`user-${i}`} content={msg.content} />;
                }
                if (msg.role === 'assistant' && selectedAgent) {
                  return (
                    <ModelResponse
                      key={`assistant-${i}`}
                      provider={selectedAgent.provider}
                      model={selectedAgent.model}
                      displayName={selectedAgent.displayName}
                      content={msg.content}
                    />
                  );
                }
                return null;
              })}
            </AnimatePresence>

            {/* Active streaming content */}
            {isStreaming && selectedAgent && (
              <ModelResponse
                provider={selectedAgent.provider}
                model={selectedAgent.model}
                displayName={selectedAgent.displayName}
                content={directChat.currentStreamContent}
                isStreaming={true}
                isThinking={!directChat.currentStreamContent}
              />
            )}

            {directChat.state === 'error' && directChat.error && (
              <div className="px-6 py-4">
                <div className="p-4 rounded-[var(--radius-md)] bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {directChat.error}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="relative flex items-end gap-3 bg-[var(--color-bg-input)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] px-4 py-3 focus-within:border-[var(--color-border-focus)] focus-within:ring-1 focus-within:ring-[var(--color-border-focus)] transition-all">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                selectedAgent
                  ? `Chat with ${selectedAgent.displayName}...`
                  : 'Select a model to start...'
              }
              rows={1}
              disabled={isStreaming || !selectedAgent}
              className="flex-1 bg-transparent text-[15px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] resize-none focus:outline-none disabled:opacity-50 min-h-[24px] max-h-[120px]"
              style={{ overflow: 'auto' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 120) + 'px';
              }}
            />
            <button
              onClick={() => updateSettings({ internetAccessEnabled: !settings.internetAccessEnabled })}
              className={`flex-shrink-0 p-1.5 rounded-[var(--radius-sm)] transition-colors ${
                settings.internetAccessEnabled
                  ? 'text-[var(--color-accent)] bg-[var(--color-accent-light)]'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
              }`}
              title={settings.internetAccessEnabled ? 'Internet access enabled' : 'Enable internet access'}
            >
              <Globe size={16} />
            </button>
            <Button
              onClick={handleSubmit}
              disabled={!input.trim() || isStreaming || !selectedAgent}
              size="sm"
              className="flex-shrink-0"
            >
              <Send size={16} />
            </Button>
          </div>
          {isStreaming && (
            <p className="mt-2 text-xs text-center text-[var(--color-text-tertiary)]">
              {selectedAgent?.displayName} is responding...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
