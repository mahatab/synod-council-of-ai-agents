import { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import UserMessage from './UserMessage';
import ModelResponse from './ModelResponse';
import MasterVerdict from './MasterVerdict';
import ClarifyingQuestion from './ClarifyingQuestion';
import FollowUpQuestion from './FollowUpQuestion';
import MentionDropdown from './MentionDropdown';
import type { MentionModel } from './MentionDropdown';
import DiscussionSettingsBar from './DiscussionSettingsBar';
import ThinkingIndicator from './ThinkingIndicator';
import ParallelStatusOverlay from './ParallelStatusOverlay';
import Button from '../common/Button';
import { useCouncilStore } from '../../stores/councilStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSessionStore } from '../../stores/sessionStore';
import { getApiKey } from '../../lib/tauri';
import { generateSessionTitle } from '../../lib/sessionTitle';
import type { DiscussionEntry, Session } from '../../types';

export default function ChatView() {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [entries, setEntries] = useState<DiscussionEntry[]>([]);
  const entriesRef = useRef<DiscussionEntry[]>([]);

  // @ mention state
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [selectedMention, setSelectedMention] = useState<MentionModel | null>(null);

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

  // Sync entries from active session (setState during render pattern)
  const activeSessionId = activeSession?.id;
  const [prevSessionId, setPrevSessionId] = useState<string | undefined>(undefined);
  if (prevSessionId !== activeSessionId) {
    setPrevSessionId(activeSessionId);
    setEntries(activeSession?.discussion ?? []);
  }

  // Keep entriesRef in sync with entries state
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, council.currentStreamContent, council.state, council.parallelStreams]);

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

  // Generate smart session title via master model
  const generateTitle = useCallback(async (question: string) => {
    try {
      const title = await generateSessionTitle(question, settingsRef.current);
      if (title) {
        updateSessionRef.current({ title });
        saveSessionRef.current(settingsRef.current.sessionSavePath).catch(console.error);
      }
    } catch (err) {
      console.error('Failed to generate session title:', err);
    }
  }, []);

  const handleSubmit = async () => {
    const question = input.trim();
    if (!question) return;

    // Close mention dropdown if open
    setShowMentionDropdown(false);
    setMentionQuery('');

    // === Follow-up path: user selected a model via @mention ===
    // Works both when discussion just finished (state 'complete') and when
    // a completed session was loaded from disk (state 'idle' but entries have a verdict)
    const hasVerdict = activeSession && entriesRef.current.some(e => e.role === 'master_verdict');
    if (selectedMention && hasVerdict && (council.state === 'complete' || council.state === 'idle')) {
      const mention = selectedMention;
      setSelectedMention(null);
      setInput('');

      // Extract the actual follow-up question (strip the @DisplayName prefix)
      const mentionPrefix = `@${mention.displayName} `;
      const followUpText = question.startsWith(mentionPrefix)
        ? question.slice(mentionPrefix.length).trim()
        : question;

      if (!followUpText) return;

      // Pass full discussion history so the model has complete context
      await council.sendFollowUp(
        mention.provider,
        mention.model,
        mention.displayName,
        followUpText,
        entriesRef.current,
        getApiKey,
        handleEntryComplete,
      );

      // Save after follow-up complete
      updateActiveSession({ discussion: entriesRef.current });
      try {
        await saveCurrentSession(settings.sessionSavePath);
      } catch (err) {
        console.error('Failed to save follow-up session:', err);
      }
      return;
    }

    // === No @mention but session has a verdict → prompt user to pick a model ===
    // Instead of starting a brand-new council, keep them in the same session
    if (!selectedMention && hasVerdict && (council.state === 'complete' || council.state === 'idle')) {
      // Show the mention dropdown — question stays in input, user picks a model
      setShowMentionDropdown(true);
      setMentionQuery('');
      return;
    }

    // === New council session path (only when there's no active verdict) ===
    // Allow submission from terminal states (complete, error), not just idle
    if (council.state !== 'idle' && council.state !== 'complete' && council.state !== 'error') return;
    if (council.state !== 'idle') {
      council.reset();
    }

    setInput('');
    setSelectedMention(null);
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

    // Save to disk immediately — session appears in sidebar right away
    try {
      await saveCurrentSession(settings.sessionSavePath);
    } catch (err) {
      console.error('Failed to save initial session:', err);
    }

    // Generate smart title in the background (fire-and-forget)
    generateTitle(question);

    // Run the council discussion (each entry auto-saves via handleEntryComplete)
    await council.startDiscussion(
      question,
      settings.councilModels,
      settings.masterModel,
      settings.systemPromptMode,
      settings.discussionDepth,
      settings.discussionStyle,
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

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);

    // Only show @ dropdown when session is complete (verdict delivered)
    if (council.state === 'complete' || (council.state === 'idle' && entries.length > 0)) {
      // Check for @ trigger: look for '@' followed by optional filter text
      const atMatch = value.match(/@(\w*)$/);
      if (atMatch) {
        setShowMentionDropdown(true);
        setMentionQuery(atMatch[1]);
      } else if (!selectedMention) {
        setShowMentionDropdown(false);
        setMentionQuery('');
      }
    } else {
      setShowMentionDropdown(false);
    }
  };

  const handleMentionSelect = (model: MentionModel) => {
    setSelectedMention(model);
    setShowMentionDropdown(false);
    setMentionQuery('');

    if (input.includes('@')) {
      // Normal typing case: user typed "@Gem..." → replace trailing @query with @ModelName
      const newInput = input.replace(/@\w*$/, `@${model.displayName} `);
      setInput(newInput);
    } else {
      // Auto-triggered case: user submitted without @, dropdown appeared
      // Prepend @ModelName to the existing question text
      setInput(`@${model.displayName} ${input}`);
    }

    // Focus the textarea
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Let MentionDropdown handle arrow keys and Enter when visible
    if (showMentionDropdown && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape')) {
      return; // MentionDropdown's global listener handles these
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isProcessing = council.state !== 'idle' && council.state !== 'complete' && council.state !== 'error';
  const hasModels = settings.councilModels.length > 0;
  const canFollowUp = activeSession != null && entries.some(e => e.role === 'master_verdict');

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
                <img
                  src="/synod-icon.png"
                  alt="Synode"
                  className="w-16 h-16 rounded-2xl mx-auto mb-6"
                />
                <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] mb-1">
                  Synode
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
                if (entry.role === 'follow_up_question') {
                  return (
                    <FollowUpQuestion
                      key={`fq-${i}`}
                      content={entry.content}
                      targetProvider={entry.targetProvider}
                      targetDisplayName={entry.targetDisplayName}
                    />
                  );
                }
                if (entry.role === 'follow_up_answer') {
                  return (
                    <ModelResponse
                      key={`fa-${i}`}
                      provider={entry.provider}
                      model={entry.model}
                      displayName={entry.displayName}
                      content={entry.content}
                      isFollowUp={true}
                    />
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

            {/* Parallel streaming content (independent mode) */}
            {council.state === 'model_turn' && council.parallelStreams.size > 0 && (
              Array.from(council.parallelStreams.entries())
                .sort(([a], [b]) => a - b)
                .map(([modelIndex, { content, done }]) => (
                  <ModelResponse
                    key={`parallel-${modelIndex}`}
                    provider={settings.councilModels[modelIndex]?.provider || ''}
                    model={settings.councilModels[modelIndex]?.model || ''}
                    displayName={settings.councilModels[modelIndex]?.displayName || ''}
                    content={content}
                    isStreaming={!done}
                    isThinking={!content && !done}
                  />
                ))
            )}

            {/* Parallel status overlay (independent mode) */}
            {council.state === 'model_turn' && council.parallelStreams.size > 0 && (
              <ParallelStatusOverlay
                parallelStreams={council.parallelStreams}
                models={settings.councilModels}
                model0Complete={entries.some(e => e.role === 'model')}
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

            {council.state === 'follow_up' && council.followUpInProgress && (() => {
              // Find the last follow-up question entry to get the target model info
              const lastFQ = [...entries].reverse().find(e => e.role === 'follow_up_question');
              if (!lastFQ || lastFQ.role !== 'follow_up_question') return null;
              return (
                <ModelResponse
                  provider={lastFQ.targetProvider}
                  model={lastFQ.targetModel}
                  displayName={lastFQ.targetDisplayName}
                  content={council.currentStreamContent}
                  isStreaming={true}
                  isThinking={!council.currentStreamContent}
                  isFollowUp={true}
                />
              );
            })()}

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

      {/* Discussion settings info bar */}
      <DiscussionSettingsBar />

      {/* Input area */}
      <div className="border-t border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="relative flex items-end gap-3 bg-[var(--color-bg-input)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] px-4 py-3 focus-within:border-[var(--color-border-focus)] focus-within:ring-1 focus-within:ring-[var(--color-border-focus)] transition-all">
            {/* Mention dropdown */}
            {showMentionDropdown && (
              <MentionDropdown
                query={mentionQuery}
                models={activeSession?.councilConfig.models ?? settings.councilModels}
                masterModel={activeSession?.councilConfig.masterModel ?? settings.masterModel}
                onSelect={handleMentionSelect}
                onClose={() => {
                  setShowMentionDropdown(false);
                  setMentionQuery('');
                }}
              />
            )}
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                !hasModels
                  ? 'Configure your models in Settings first...'
                  : canFollowUp
                    ? 'Ask the council... or @mention a model to follow up'
                    : 'Ask the council for advice...'
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
              {council.state === 'follow_up' ? 'Getting follow-up response...' : 'Council is deliberating...'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
