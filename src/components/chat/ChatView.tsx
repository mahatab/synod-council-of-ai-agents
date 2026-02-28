import { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Send, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import UserMessage from './UserMessage';
import ModelResponse from './ModelResponse';
import MasterVerdict from './MasterVerdict';
import ClarifyingQuestion from './ClarifyingQuestion';
import ThinkingIndicator from './ThinkingIndicator';
import Button from '../common/Button';
import { useCouncilStore } from '../../stores/councilStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSessionStore } from '../../stores/sessionStore';
import { getApiKey, streamChat, onStreamToken } from '../../lib/tauri';
import type { DiscussionEntry, Session } from '../../types';

export default function ChatView() {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [entries, setEntries] = useState<DiscussionEntry[]>([]);
  const entriesRef = useRef<DiscussionEntry[]>([]);

  const council = useCouncilStore();
  const settings = useSettingsStore((s) => s.settings);
  const { activeSession, createSession, saveCurrentSession, updateActiveSession } =
    useSessionStore();
  const sessionLoading = useSessionStore((s) => s.loading);
  const sessionError = useSessionStore((s) => s.error);

  // Refs for stable access in callbacks (avoid stale closures)
  const saveSessionRef = useRef(saveCurrentSession);
  const updateSessionRef = useRef(updateActiveSession);
  const settingsRef = useRef(settings);

  useEffect(() => {
    saveSessionRef.current = saveCurrentSession;
    updateSessionRef.current = updateActiveSession;
    settingsRef.current = settings;
  }, [saveCurrentSession, updateActiveSession, settings]);

  // Load entries from active session
  useEffect(() => {
    if (activeSession) {
      setEntries(activeSession.discussion);
      entriesRef.current = activeSession.discussion;
    } else {
      setEntries([]);
      entriesRef.current = [];
    }
  }, [activeSession?.id]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, council.currentStreamContent, council.state]);

  // Incremental auto-save after each entry
  const handleEntryComplete = useCallback(
    (entry: DiscussionEntry) => {
      const updated = [...entriesRef.current, entry];
      entriesRef.current = updated;
      setEntries(updated);
      updateSessionRef.current({ discussion: [...updated] });
      saveSessionRef.current(settingsRef.current.sessionSavePath).catch((err) => {
        console.error('Failed to auto-save session entry:', err);
      });
    },
    [],
  );

  // Step 5: Generate smart session title via master model
  const generateSessionTitle = useCallback(async (question: string) => {
    try {
      const currentSettings = settingsRef.current;
      const masterApiKey = await getApiKey(
        `com.council-of-ai-agents.${currentSettings.masterModel.provider}`,
      );
      if (!masterApiKey) return;

      const streamId = uuidv4();
      const unlisten = await onStreamToken(streamId, () => {});
      const title = await streamChat(
        currentSettings.masterModel.provider as any,
        currentSettings.masterModel.model,
        [
          {
            role: 'user',
            content: `Generate a short, descriptive title (5-8 words max, no quotes, no punctuation at the end) for this conversation:\n\n"${question}"`,
          },
        ],
        'You generate concise conversation titles. Return ONLY the title text, nothing else.',
        masterApiKey,
        streamId,
      );
      unlisten();

      const cleanTitle = title.trim().replace(/^["']|["']$/g, '');
      if (cleanTitle) {
        updateSessionRef.current({ title: cleanTitle });
        saveSessionRef.current(settingsRef.current.sessionSavePath).catch(console.error);
      }
    } catch (err) {
      console.error('Failed to generate session title:', err);
      // Placeholder title remains — no user impact
    }
  }, []);

  const handleSubmit = async () => {
    const question = input.trim();
    if (!question) return;

    // Step 1: Allow submission from terminal states (complete, error), not just idle
    if (council.state !== 'idle' && council.state !== 'complete' && council.state !== 'error') return;
    if (council.state !== 'idle') {
      council.reset();
    }

    setInput('');
    setEntries([]);
    entriesRef.current = [];

    // Create a new session with placeholder title
    const session: Session = {
      id: uuidv4(),
      title: question.length > 57 ? question.slice(0, 57) + '...' : question,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userQuestion: question,
      councilConfig: {
        models: settings.councilModels,
        masterModel: settings.masterModel,
        systemPromptMode: settings.systemPromptMode,
      },
      discussion: [],
    };

    createSession(session);

    // Step 2: Save to disk immediately — session appears in sidebar right away
    try {
      await saveCurrentSession(settings.sessionSavePath);
    } catch (err) {
      console.error('Failed to save initial session:', err);
    }

    // Step 5: Generate smart title in the background (fire-and-forget)
    generateSessionTitle(question);

    // Run the council discussion (each entry auto-saves via handleEntryComplete)
    await council.startDiscussion(
      question,
      settings.councilModels,
      settings.masterModel,
      settings.systemPromptMode,
      getApiKey,
      handleEntryComplete,
    );

    // Final save with all collected entries
    updateActiveSession({ discussion: entriesRef.current });
    try {
      await saveCurrentSession(settings.sessionSavePath);
    } catch (err) {
      console.error('Failed to save completed session:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isProcessing = council.state !== 'idle' && council.state !== 'complete' && council.state !== 'error';
  const hasModels = settings.councilModels.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {entries.length === 0 && council.state === 'idle' && !sessionLoading ? (
          sessionError ? (
            <div className="flex flex-col items-center justify-center h-full px-6">
              <div className="text-center max-w-lg">
                <div className="p-4 rounded-[var(--radius-md)] bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {sessionError}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full px-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="text-center max-w-lg"
              >
                <div className="w-16 h-16 rounded-2xl bg-[var(--color-accent-light)] flex items-center justify-center mx-auto mb-6">
                  <Sparkles size={28} className="text-[var(--color-accent)]" />
                </div>
                <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] mb-1">
                  Synod
                </h1>
                <p className="text-sm text-[var(--color-text-tertiary)] mb-3">
                  Council of AI Agents
                </p>
                <p className="text-[var(--color-text-secondary)] text-[15px] leading-relaxed mb-6">
                  Ask a question and get insights from multiple AI models working
                  together. Each model provides its unique perspective before a
                  master model delivers the final verdict.
                </p>
                {!hasModels && (
                  <p className="text-sm text-[var(--color-accent)]">
                    Set up your council models in Settings to get started.
                  </p>
                )}
              </motion.div>
            </div>
          )
        ) : entries.length === 0 && sessionLoading ? (
          <div className="flex flex-col items-center justify-center h-full px-6">
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2.5 h-2.5 rounded-full bg-[var(--color-accent)] thinking-dot"
                />
              ))}
            </div>
            <p className="mt-3 text-sm text-[var(--color-text-tertiary)]">
              Loading session...
            </p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto py-6">
            <AnimatePresence>
              {entries.map((entry, i) => {
                if (entry.role === 'user') {
                  return <UserMessage key={`user-${i}`} content={entry.content} />;
                }
                if (entry.role === 'model') {
                  return (
                    <ModelResponse
                      key={`model-${i}`}
                      provider={entry.provider}
                      model={entry.model}
                      displayName={entry.displayName}
                      content={entry.content}
                      clarifyingExchange={entry.clarifyingExchange}
                    />
                  );
                }
                if (entry.role === 'master_verdict') {
                  return (
                    <MasterVerdict key={`verdict-${i}`} content={entry.content} />
                  );
                }
                return null;
              })}
            </AnimatePresence>

            {/* Active streaming content */}
            {council.state === 'generating_system_prompts' && (
              <div className="px-6 py-4">
                <ThinkingIndicator modelName="Generating system prompts" />
              </div>
            )}

            {council.state === 'model_turn' && council.currentModelIndex >= 0 && (
              <ModelResponse
                provider={settings.councilModels[council.currentModelIndex]?.provider || ''}
                model={settings.councilModels[council.currentModelIndex]?.model || ''}
                displayName={
                  settings.councilModels[council.currentModelIndex]?.displayName || ''
                }
                content={council.currentStreamContent}
                isStreaming={true}
                isThinking={!council.currentStreamContent}
              />
            )}

            {council.state === 'clarifying_qa' && council.waitingForClarification && (
              <ClarifyingQuestion
                question={
                  council.clarifyingExchanges[council.clarifyingExchanges.length - 1]
                    ?.question || ''
                }
                onAnswer={council.submitClarification}
              />
            )}

            {council.state === 'master_verdict' && (
              <MasterVerdict
                content={council.currentStreamContent}
                isStreaming={true}
                isThinking={!council.currentStreamContent}
              />
            )}

            {council.state === 'error' && council.error && (
              <div className="px-6 py-4">
                <div className="p-4 rounded-[var(--radius-md)] bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {council.error}
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
                hasModels
                  ? 'Ask the council for advice...'
                  : 'Configure your models in Settings first...'
              }
              rows={1}
              disabled={isProcessing || !hasModels}
              className="flex-1 bg-transparent text-[15px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] resize-none focus:outline-none disabled:opacity-50 min-h-[24px] max-h-[120px]"
              style={{ overflow: 'auto' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 120) + 'px';
              }}
            />
            <Button
              onClick={handleSubmit}
              disabled={!input.trim() || isProcessing || !hasModels}
              size="sm"
              className="flex-shrink-0"
            >
              <Send size={16} />
            </Button>
          </div>
          {isProcessing && (
            <p className="mt-2 text-xs text-center text-[var(--color-text-tertiary)]">
              Council is deliberating...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
