import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
  CouncilState,
  DiscussionEntry,
  DiscussionDepth,
  DiscussionStyle,
  ModelConfig,
  MasterModelConfig,
  ChatMessage,
  ClarifyingExchange,
  Provider,
  UsageData,
} from '../types';
import * as tauri from '../lib/tauri';

interface CouncilStoreState {
  state: CouncilState;
  currentModelIndex: number;
  currentStreamId: string | null;
  currentStreamContent: string;
  systemPrompts: Map<string, string>;
  clarifyingExchanges: ClarifyingExchange[];
  waitingForClarification: boolean;
  parallelStreams: Map<number, { content: string; done: boolean }>;
  followUpInProgress: boolean;
  error: string | null;

  // Actions
  startDiscussion: (
    userQuestion: string,
    models: ModelConfig[],
    masterModel: MasterModelConfig,
    systemPromptMode: 'upfront' | 'dynamic',
    discussionDepth: DiscussionDepth,
    discussionStyle: DiscussionStyle,
    getApiKey: (service: string) => Promise<string | null>,
    onEntryComplete: (entry: DiscussionEntry) => void,
  ) => Promise<void>;

  sendFollowUp: (
    targetProvider: string,
    targetModel: string,
    targetDisplayName: string,
    followUpQuestion: string,
    discussionEntries: DiscussionEntry[],
    getApiKey: (service: string) => Promise<string | null>,
    onEntryComplete: (entry: DiscussionEntry) => void,
  ) => Promise<void>;

  submitClarification: (answer: string) => void;
  reset: () => void;
}

export const useCouncilStore = create<CouncilStoreState>((set, get) => ({
  state: 'idle',
  currentModelIndex: -1,
  currentStreamId: null,
  currentStreamContent: '',
  systemPrompts: new Map(),
  clarifyingExchanges: [],
  waitingForClarification: false,
  parallelStreams: new Map(),
  followUpInProgress: false,
  error: null,

  startDiscussion: async (
    userQuestion,
    models,
    masterModel,
    systemPromptMode,
    discussionDepth,
    discussionStyle,
    getApiKey,
    onEntryComplete,
  ) => {
    set({ state: 'user_input', error: null });

    // Add user entry
    onEntryComplete({ role: 'user', content: userQuestion });

    const discussionSoFar: DiscussionEntry[] = [
      { role: 'user', content: userQuestion },
    ];

    // Track master model usage across prompt generation + verdict
    let masterPromptGenUsage: UsageData | undefined;

    // Generate system prompts if upfront mode
    if (systemPromptMode === 'upfront') {
      set({ state: 'generating_system_prompts' });
      try {
        const masterApiKey = await getApiKey(
          `com.council-of-ai-agents.${masterModel.provider}`,
        );
        if (!masterApiKey) {
          set({ state: 'error', error: `No API key found for master model provider (${masterModel.provider})` });
          return;
        }

        const styleInstruction = discussionStyle === 'independent'
          ? '\nIMPORTANT: Each model is responding INDEPENDENTLY and will NOT see any other model\'s response. Do NOT instruct them to reference, build on, or respond to other models. Each should provide their own standalone analysis as if they are the only one answering.\n'
          : '\nEach model should be encouraged to provide unique perspectives and not just repeat previous opinions.\n';

        const promptGenMessages: ChatMessage[] = [
          {
            role: 'user',
            content: `You are the orchestrator of a council of AI models helping a user make an informed decision. The user's question is:

"${userQuestion}"

The following AI models will ${discussionStyle === 'independent' ? 'independently analyze' : 'discuss'} this question${discussionStyle === 'sequential' ? ' in order' : ''}:
${models.map((m, i) => `${i + 1}. ${m.displayName} (${m.provider})`).join('\n')}

Generate a specific, tailored system prompt for EACH council model that helps them provide their best analysis. The first model (${models[0]?.displayName}) should be instructed that it MAY ask up to 2 clarifying questions if needed. All other models should be told they CANNOT ask questions.
${styleInstruction}
${discussionDepth === 'concise' ? '\nIMPORTANT: Instruct each model to keep responses brief and focused — 2-3 key points maximum. No lengthy explanations.\n' : ''}
Return your response in this exact JSON format:
${JSON.stringify(
  models.reduce(
    (acc, m) => ({
      ...acc,
      [`${m.provider}:${m.model}`]: 'system prompt here',
    }),
    {},
  ),
  null,
  2,
)}`,
          },
        ];

        const streamId = uuidv4();
        const unlisten = await tauri.onStreamToken(streamId, (token) => {
          if (!token.done) {
            set((s) => ({
              currentStreamContent: s.currentStreamContent + token.token,
            }));
          }
        });

        set({ currentStreamId: streamId, currentStreamContent: '' });

        const result = await tauri.streamChat(
          masterModel.provider,
          masterModel.model,
          promptGenMessages,
          'You are an AI orchestrator. Generate system prompts for council models. Return valid JSON only.',
          masterApiKey,
          streamId,
        );

        unlisten();
        set({ currentStreamId: null, currentStreamContent: '' });
        masterPromptGenUsage = result.usage;

        // Parse the JSON response
        try {
          const jsonMatch = result.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const prompts = JSON.parse(jsonMatch[0]);
            const promptMap = new Map<string, string>();
            for (const [key, value] of Object.entries(prompts)) {
              promptMap.set(key, value as string);
            }
            set({ systemPrompts: promptMap });
          }
        } catch {
          // If JSON parsing fails, continue without custom prompts
          console.warn('Failed to parse system prompts, using defaults');
        }
      } catch (err) {
        set({
          state: 'error',
          error: `Failed to generate system prompts: ${err}`,
        });
        return;
      }
    }

    if (discussionStyle === 'independent') {
      // === PARALLEL EXECUTION FOR INDEPENDENT MODE ===
      // First model runs sequentially (may ask clarifying questions),
      // then remaining models run in parallel for faster results.

      // Process first model sequentially
      if (models.length > 0) {
        const model = models[0];
        set({ state: 'model_turn', currentModelIndex: 0 });

        try {
          const apiKey = await getApiKey(
            `com.council-of-ai-agents.${model.provider}`,
          );
          if (!apiKey) {
            set({
              state: 'error',
              error: `No API key found for ${model.displayName} (${model.provider})`,
            });
            return;
          }

          const messages: ChatMessage[] = buildContextMessages(
            userQuestion, discussionSoFar, true, discussionStyle,
          );

          const systemPromptKey = `${model.provider}:${model.model}`;
          const systemPrompt =
            get().systemPrompts.get(systemPromptKey) || getDefaultSystemPrompt(model, true, discussionDepth, discussionStyle);

          // Dynamic mode: first model doesn't need dynamic prompt (no prior context)

          const streamId = uuidv4();
          set({ currentStreamId: streamId, currentStreamContent: '' });

          const unlisten = await tauri.onStreamToken(streamId, (token) => {
            if (!token.done && !token.error) {
              set((s) => ({
                currentStreamContent: s.currentStreamContent + token.token,
              }));
            }
          });

          const result = await tauri.streamChat(
            model.provider, model.model, messages, systemPrompt, apiKey, streamId,
          );

          unlisten();
          set({ currentStreamId: null, currentStreamContent: '', currentModelIndex: -1 });

          // Check if first model asked a clarifying question
          if (looksLikeClarifyingQuestion(result.content)) {
            set({
              state: 'clarifying_qa',
              waitingForClarification: true,
              clarifyingExchanges: [{ question: result.content, answer: '' }],
            });

            await new Promise<void>((resolve) => {
              const checkInterval = setInterval(() => {
                const current = get();
                if (!current.waitingForClarification) {
                  clearInterval(checkInterval);
                  resolve();
                }
              }, 200);
            });

            const exchanges = get().clarifyingExchanges;
            const clarifyAnswer = exchanges[exchanges.length - 1]?.answer;

            if (clarifyAnswer) {
              const followUpMessages: ChatMessage[] = [
                ...messages,
                { role: 'assistant', content: result.content },
                { role: 'user', content: clarifyAnswer },
              ];

              const followUpStreamId = uuidv4();
              set({
                state: 'model_turn',
                currentStreamId: followUpStreamId,
                currentStreamContent: '',
              });

              const followUpUnlisten = await tauri.onStreamToken(
                followUpStreamId,
                (token) => {
                  if (!token.done && !token.error) {
                    set((s) => ({
                      currentStreamContent: s.currentStreamContent + token.token,
                    }));
                  }
                },
              );

              const followUpResult = await tauri.streamChat(
                model.provider, model.model, followUpMessages, systemPrompt, apiKey, followUpStreamId,
              );

              followUpUnlisten();
              set({ currentStreamId: null, currentStreamContent: '' });

              const combinedUsage = combineUsage(result.usage, followUpResult.usage);

              const entry: DiscussionEntry = {
                role: 'model',
                provider: model.provider,
                model: model.model,
                displayName: model.displayName,
                systemPrompt,
                content: followUpResult.content,
                clarifyingExchange: exchanges.map((e) => ({
                  question: e.question,
                  answer: e.answer,
                })),
                usage: combinedUsage,
              };
              discussionSoFar.push(entry);
              onEntryComplete(entry);
            }
          } else {
            const entry: DiscussionEntry = {
              role: 'model',
              provider: model.provider,
              model: model.model,
              displayName: model.displayName,
              systemPrompt,
              content: result.content,
              usage: result.usage,
            };
            discussionSoFar.push(entry);
            onEntryComplete(entry);
          }
        } catch (err) {
          const entry: DiscussionEntry = {
            role: 'model',
            provider: models[0].provider,
            model: models[0].model,
            displayName: models[0].displayName,
            content: `[Error: Failed to get response - ${err}]`,
          };
          discussionSoFar.push(entry);
          onEntryComplete(entry);
        }
      }

      // Process remaining models in parallel
      if (models.length > 1) {
        const remainingModels = models.slice(1);

        // Phase 1: Pre-fetch API keys and generate dynamic prompts (before parallel streaming)
        const modelPrep = await Promise.all(
          remainingModels.map(async (model, arrayIdx) => {
            const modelIndex = arrayIdx + 1;
            try {
              const apiKey = await getApiKey(
                `com.council-of-ai-agents.${model.provider}`,
              );
              if (!apiKey) {
                throw new Error(`No API key found for ${model.displayName} (${model.provider})`);
              }

              const systemPromptKey = `${model.provider}:${model.model}`;
              let systemPrompt =
                get().systemPrompts.get(systemPromptKey) || getDefaultSystemPrompt(model, false, discussionDepth, 'independent');

              // Dynamic mode: generate prompt via master model
              if (systemPromptMode === 'dynamic') {
                try {
                  const masterApiKey = await getApiKey(
                    `com.council-of-ai-agents.${masterModel.provider}`,
                  );
                  if (masterApiKey) {
                    const dynamicStreamId = uuidv4();
                    const dynamicUnlisten = await tauri.onStreamToken(dynamicStreamId, () => {});
                    const dynamicResult = await tauri.streamChat(
                      masterModel.provider,
                      masterModel.model,
                      [{
                        role: 'user',
                        content: `Generate a system prompt for ${model.displayName} to independently analyze: "${userQuestion}". The model is responding independently and will NOT see other models' responses. It should provide its own standalone analysis. Return only the system prompt text, no JSON.`,
                      }],
                      'Generate a concise system prompt. Return only the prompt text.',
                      masterApiKey,
                      dynamicStreamId,
                    );
                    dynamicUnlisten();
                    systemPrompt = dynamicResult.content;
                    if (dynamicResult.usage) {
                      if (!masterPromptGenUsage) {
                        masterPromptGenUsage = { inputTokens: 0, outputTokens: 0 };
                      }
                      masterPromptGenUsage.inputTokens += dynamicResult.usage.inputTokens;
                      masterPromptGenUsage.outputTokens += dynamicResult.usage.outputTokens;
                    }
                  }
                } catch {
                  // Fall back to default prompt
                }
              }

              return { model, modelIndex, apiKey, systemPrompt, error: null as string | null };
            } catch (err) {
              return { model, modelIndex, apiKey: null as string | null, systemPrompt: '', error: String(err) };
            }
          }),
        );

        // Phase 2: Fire all model API calls simultaneously
        const initialStreams = new Map<number, { content: string; done: boolean }>();
        for (let idx = 1; idx < models.length; idx++) {
          initialStreams.set(idx, { content: '', done: false });
        }
        set({ state: 'model_turn', currentModelIndex: -1, parallelStreams: initialStreams });

        const messages: ChatMessage[] = buildContextMessages(
          userQuestion, discussionSoFar, false, 'independent',
        );

        const parallelResults = await Promise.all(
          modelPrep.map(async (prep) => {
            if (prep.error !== null || !prep.apiKey) {
              // Mark as done on error
              set((s) => {
                const m = new Map(s.parallelStreams);
                m.set(prep.modelIndex, { content: '', done: true });
                return { parallelStreams: m };
              });
              return { model: prep.model, modelIndex: prep.modelIndex, result: null as null | { content: string; usage?: UsageData }, systemPrompt: prep.systemPrompt, error: prep.error || 'No API key' };
            }

            try {
              const streamId = uuidv4();
              const unlisten = await tauri.onStreamToken(streamId, (token) => {
                if (!token.done && !token.error) {
                  set((s) => {
                    const m = new Map(s.parallelStreams);
                    const current = m.get(prep.modelIndex);
                    m.set(prep.modelIndex, { content: (current?.content || '') + token.token, done: false });
                    return { parallelStreams: m };
                  });
                }
              });

              const result = await tauri.streamChat(
                prep.model.provider, prep.model.model, messages, prep.systemPrompt, prep.apiKey, streamId,
              );
              unlisten();

              // Mark this model as done streaming
              set((s) => {
                const m = new Map(s.parallelStreams);
                const current = m.get(prep.modelIndex);
                if (current) {
                  m.set(prep.modelIndex, { ...current, done: true });
                }
                return { parallelStreams: m };
              });

              return { model: prep.model, modelIndex: prep.modelIndex, result, systemPrompt: prep.systemPrompt, error: null as string | null };
            } catch (err) {
              // Mark as done on error
              set((s) => {
                const m = new Map(s.parallelStreams);
                const current = m.get(prep.modelIndex);
                m.set(prep.modelIndex, { content: current?.content || '', done: true });
                return { parallelStreams: m };
              });
              return { model: prep.model, modelIndex: prep.modelIndex, result: null as null | { content: string; usage?: UsageData }, systemPrompt: prep.systemPrompt, error: String(err) };
            }
          }),
        );

        // Clear parallel streams
        set({ parallelStreams: new Map() });

        // Add entries in model order
        for (const r of parallelResults) {
          if (r.error === null && r.result) {
            const entry: DiscussionEntry = {
              role: 'model',
              provider: r.model.provider,
              model: r.model.model,
              displayName: r.model.displayName,
              systemPrompt: r.systemPrompt,
              content: r.result.content,
              usage: r.result.usage,
            };
            discussionSoFar.push(entry);
            onEntryComplete(entry);
          } else {
            const entry: DiscussionEntry = {
              role: 'model',
              provider: r.model.provider,
              model: r.model.model,
              displayName: r.model.displayName,
              content: `[Error: Failed to get response - ${r.error}]`,
            };
            discussionSoFar.push(entry);
            onEntryComplete(entry);
          }
        }
      }
    } else {
      // === SEQUENTIAL EXECUTION ===
      for (let i = 0; i < models.length; i++) {
        const model = models[i];
        set({ state: 'model_turn', currentModelIndex: i });

        try {
          const apiKey = await getApiKey(
            `com.council-of-ai-agents.${model.provider}`,
          );
          if (!apiKey) {
            set({
              state: 'error',
              error: `No API key found for ${model.displayName} (${model.provider})`,
            });
            return;
          }

          // Build messages context
          const messages: ChatMessage[] = buildContextMessages(
            userQuestion,
            discussionSoFar,
            i === 0,
            discussionStyle,
          );

          // Get system prompt
          const systemPromptKey = `${model.provider}:${model.model}`;
          let systemPrompt =
            get().systemPrompts.get(systemPromptKey) || getDefaultSystemPrompt(model, i === 0, discussionDepth, discussionStyle);

          // Dynamic mode: generate prompt for this model
          if (systemPromptMode === 'dynamic' && i > 0) {
            try {
              const masterApiKey = await getApiKey(
                `com.council-of-ai-agents.${masterModel.provider}`,
              );
              if (masterApiKey) {
                const dynamicStreamId = uuidv4();
                const dynamicUnlisten = await tauri.onStreamToken(
                  dynamicStreamId,
                  () => {},
                );
                const dynamicResult = await tauri.streamChat(
                  masterModel.provider,
                  masterModel.model,
                  [
                    {
                      role: 'user',
                      content: `Generate a system prompt for ${model.displayName} to analyze: "${userQuestion}". Previous discussion: ${JSON.stringify(discussionSoFar)}. The model should provide a unique perspective. Return only the system prompt text, no JSON.`,
                    },
                  ],
                  'Generate a concise system prompt. Return only the prompt text.',
                  masterApiKey,
                  dynamicStreamId,
                );
                dynamicUnlisten();
                systemPrompt = dynamicResult.content;
                // Accumulate dynamic prompt gen usage with master usage
                if (dynamicResult.usage) {
                  if (!masterPromptGenUsage) {
                    masterPromptGenUsage = { inputTokens: 0, outputTokens: 0 };
                  }
                  masterPromptGenUsage.inputTokens += dynamicResult.usage.inputTokens;
                  masterPromptGenUsage.outputTokens += dynamicResult.usage.outputTokens;
                }
              }
            } catch {
              // Fall back to default prompt
            }
          }

          // Stream the model's response
          const streamId = uuidv4();
          set({ currentStreamId: streamId, currentStreamContent: '' });

          const unlisten = await tauri.onStreamToken(streamId, (token) => {
            if (!token.done && !token.error) {
              set((s) => ({
                currentStreamContent: s.currentStreamContent + token.token,
              }));
            }
          });

          const result = await tauri.streamChat(
            model.provider,
            model.model,
            messages,
            systemPrompt,
            apiKey,
            streamId,
          );

          unlisten();
          set({ currentStreamId: null, currentStreamContent: '' });

          // Check if first model asked a clarifying question
          if (i === 0 && looksLikeClarifyingQuestion(result.content)) {
            set({
              state: 'clarifying_qa',
              waitingForClarification: true,
              clarifyingExchanges: [{ question: result.content, answer: '' }],
            });

            // Wait for user's clarification answer
            await new Promise<void>((resolve) => {
              const checkInterval = setInterval(() => {
                const current = get();
                if (!current.waitingForClarification) {
                  clearInterval(checkInterval);
                  resolve();
                }
              }, 200);
            });

            const exchanges = get().clarifyingExchanges;
            const clarifyAnswer = exchanges[exchanges.length - 1]?.answer;

            if (clarifyAnswer) {
              // Get follow-up response from the first model
              const followUpMessages: ChatMessage[] = [
                ...messages,
                { role: 'assistant', content: result.content },
                { role: 'user', content: clarifyAnswer },
              ];

              const followUpStreamId = uuidv4();
              set({
                state: 'model_turn',
                currentStreamId: followUpStreamId,
                currentStreamContent: '',
              });

              const followUpUnlisten = await tauri.onStreamToken(
                followUpStreamId,
                (token) => {
                  if (!token.done && !token.error) {
                    set((s) => ({
                      currentStreamContent: s.currentStreamContent + token.token,
                    }));
                  }
                },
              );

              const followUpResult = await tauri.streamChat(
                model.provider,
                model.model,
                followUpMessages,
                systemPrompt,
                apiKey,
                followUpStreamId,
              );

              followUpUnlisten();
              set({ currentStreamId: null, currentStreamContent: '' });

              // Combine initial question usage + follow-up usage
              const combinedUsage = combineUsage(result.usage, followUpResult.usage);

              const entry: DiscussionEntry = {
                role: 'model',
                provider: model.provider,
                model: model.model,
                displayName: model.displayName,
                systemPrompt,
                content: followUpResult.content,
                clarifyingExchange: exchanges.map((e) => ({
                  question: e.question,
                  answer: e.answer,
                })),
                usage: combinedUsage,
              };
              discussionSoFar.push(entry);
              onEntryComplete(entry);
            }
          } else {
            const entry: DiscussionEntry = {
              role: 'model',
              provider: model.provider,
              model: model.model,
              displayName: model.displayName,
              systemPrompt,
              content: result.content,
              usage: result.usage,
            };
            discussionSoFar.push(entry);
            onEntryComplete(entry);
          }
        } catch (err) {
          // Add error entry and continue to next model
          const entry: DiscussionEntry = {
            role: 'model',
            provider: model.provider,
            model: model.model,
            displayName: model.displayName,
            content: `[Error: Failed to get response - ${err}]`,
          };
          discussionSoFar.push(entry);
          onEntryComplete(entry);
        }
      }
    }

    // Master verdict
    set({ state: 'master_verdict', currentModelIndex: -1 });

    try {
      const masterApiKey = await getApiKey(
        `com.council-of-ai-agents.${masterModel.provider}`,
      );
      if (!masterApiKey) {
        set({
          state: 'error',
          error: `No API key found for master model (${masterModel.provider})`,
        });
        return;
      }

      const verdictMessages: ChatMessage[] = [
        {
          role: 'user',
          content: buildMasterVerdictPrompt(userQuestion, discussionSoFar),
        },
      ];

      const streamId = uuidv4();
      set({ currentStreamId: streamId, currentStreamContent: '' });

      const unlisten = await tauri.onStreamToken(streamId, (token) => {
        if (!token.done && !token.error) {
          set((s) => ({
            currentStreamContent: s.currentStreamContent + token.token,
          }));
        }
      });

      const masterSystemPrompt = discussionDepth === 'concise'
        ? `You are the master AI judge in a council of AI models. You have reviewed all council members' opinions on the user's question. Deliver a brief, focused verdict in 3-5 sentences. Highlight only the key takeaway and recommended action. No lengthy sections.`
        : `You are the master AI judge in a council of AI models. You have reviewed all council members' opinions on the user's question. Your job is to synthesize the best advice, resolve any disagreements, and deliver a clear, actionable final verdict. Be thorough but concise. Structure your response with clear sections.`;

      const verdictResult = await tauri.streamChat(
        masterModel.provider,
        masterModel.model,
        verdictMessages,
        masterSystemPrompt,
        masterApiKey,
        streamId,
      );

      unlisten();
      set({ currentStreamId: null, currentStreamContent: '' });

      // Combine prompt generation usage + verdict usage for master model total
      const masterTotalUsage = combineUsage(masterPromptGenUsage, verdictResult.usage);

      const verdictEntry: DiscussionEntry = {
        role: 'master_verdict',
        provider: masterModel.provider,
        model: masterModel.model,
        content: verdictResult.content,
        usage: masterTotalUsage,
      };
      onEntryComplete(verdictEntry);

      set({ state: 'complete' });
    } catch (err) {
      set({ state: 'error', error: `Master verdict failed: ${err}` });
    }
  },

  sendFollowUp: async (
    targetProvider,
    targetModel,
    targetDisplayName,
    followUpQuestion,
    discussionEntries,
    getApiKey,
    onEntryComplete,
  ) => {
    set({
      state: 'follow_up',
      followUpInProgress: true,
      error: null,
    });

    // Emit the follow-up question entry
    onEntryComplete({
      role: 'follow_up_question',
      content: followUpQuestion,
      targetProvider,
      targetModel,
      targetDisplayName,
    });

    try {
      const apiKey = await getApiKey(
        `com.council-of-ai-agents.${targetProvider}`,
      );
      if (!apiKey) {
        set({
          state: 'error',
          followUpInProgress: false,
          error: `No API key found for ${targetDisplayName} (${targetProvider})`,
        });
        return;
      }

      // Build messages with full discussion context
      const messages = buildFollowUpMessages(discussionEntries, followUpQuestion);

      const systemPrompt =
        `You are ${targetDisplayName}, part of an AI council discussion. You have access to the full discussion including all council members' responses and the master verdict. The user has a follow-up question directed at you. Answer helpfully, referencing any part of the discussion as needed. Be direct and concise.`;

      const streamId = uuidv4();
      set({ currentStreamId: streamId, currentStreamContent: '' });

      const unlisten = await tauri.onStreamToken(streamId, (token) => {
        if (!token.done && !token.error) {
          set((s) => ({
            currentStreamContent: s.currentStreamContent + token.token,
          }));
        }
      });

      const result = await tauri.streamChat(
        targetProvider as Provider,
        targetModel,
        messages,
        systemPrompt,
        apiKey,
        streamId,
      );

      unlisten();
      set({ currentStreamId: null, currentStreamContent: '' });

      // Emit the follow-up answer entry
      onEntryComplete({
        role: 'follow_up_answer',
        provider: targetProvider,
        model: targetModel,
        displayName: targetDisplayName,
        content: result.content,
        usage: result.usage,
      });

      set({ state: 'complete', followUpInProgress: false });
    } catch (err) {
      // Emit error entry and recover to complete state
      onEntryComplete({
        role: 'follow_up_answer',
        provider: targetProvider,
        model: targetModel,
        displayName: targetDisplayName,
        content: `[Error: Failed to get follow-up response - ${err}]`,
      });
      set({ state: 'complete', followUpInProgress: false, currentStreamId: null, currentStreamContent: '' });
    }
  },

  submitClarification: (answer) => {
    set((s) => {
      const exchanges = [...s.clarifyingExchanges];
      if (exchanges.length > 0) {
        exchanges[exchanges.length - 1].answer = answer;
      }
      return {
        clarifyingExchanges: exchanges,
        waitingForClarification: false,
      };
    });
  },

  reset: () => {
    set({
      state: 'idle',
      currentModelIndex: -1,
      currentStreamId: null,
      currentStreamContent: '',
      systemPrompts: new Map(),
      clarifyingExchanges: [],
      waitingForClarification: false,
      parallelStreams: new Map(),
      followUpInProgress: false,
      error: null,
    });
  },
}));

function buildContextMessages(
  userQuestion: string,
  discussionSoFar: DiscussionEntry[],
  isFirstModel: boolean,
  discussionStyle: DiscussionStyle = 'sequential',
): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: 'user', content: userQuestion },
  ];

  if (!isFirstModel && discussionStyle === 'sequential') {
    const previousOpinions = discussionSoFar
      .filter((e): e is Extract<DiscussionEntry, { role: 'model' }> => e.role === 'model')
      .map(
        (e) =>
          `--- ${e.displayName} (${e.provider}) ---\n${e.content}`,
      )
      .join('\n\n');

    if (previousOpinions) {
      messages.push({
        role: 'user',
        content: `Here are the previous council members' opinions:\n\n${previousOpinions}\n\nPlease provide your own analysis and verdict. You may agree or disagree with previous opinions, but provide your own reasoning.`,
      });
    }
  }

  return messages;
}

function getDefaultSystemPrompt(model: ModelConfig, isFirst: boolean, depth: DiscussionDepth = 'thorough', style: DiscussionStyle = 'sequential'): string {
  const depthInstruction = depth === 'concise'
    ? 'Be concise and direct. Provide 2-3 key points maximum. Skip lengthy explanations and focus on actionable insights.'
    : 'Be thorough, factual, and specific.';

  if (isFirst) {
    return `You are ${model.displayName}, a member of an AI council helping a user make an informed decision. You are the FIRST model to respond. You may ask up to 2 brief clarifying questions if the user's question is ambiguous or missing important details. If the question is clear enough, proceed directly with your analysis and recommendation. ${depthInstruction}`;
  }

  if (style === 'independent') {
    return `You are ${model.displayName}, a member of an AI council helping a user make an informed decision. You are responding independently — other council members are also analyzing this question separately. Provide your honest, unbiased analysis and recommendation. Do NOT ask any questions to the user. ${depthInstruction}`;
  }

  return `You are ${model.displayName}, a member of an AI council helping a user make an informed decision. You will see the user's question and previous council members' responses. Provide your own unique perspective and analysis. Do NOT ask any questions to the user. ${depthInstruction} If you agree with previous members, explain why. If you disagree, explain your reasoning.`;
}

function looksLikeClarifyingQuestion(response: string): boolean {
  const questionIndicators = [
    'before I provide my recommendation',
    'could you clarify',
    'I have a few questions',
    'let me ask',
    'to help narrow down',
    'could you tell me',
    'what is your preference',
    'do you have a preference',
  ];
  const lowerResponse = response.toLowerCase();
  return questionIndicators.some((indicator) =>
    lowerResponse.includes(indicator),
  ) && response.includes('?');
}

function combineUsage(a?: UsageData, b?: UsageData): UsageData | undefined {
  if (!a && !b) return undefined;
  return {
    inputTokens: (a?.inputTokens ?? 0) + (b?.inputTokens ?? 0),
    outputTokens: (a?.outputTokens ?? 0) + (b?.outputTokens ?? 0),
  };
}

function buildFollowUpMessages(
  entries: DiscussionEntry[],
  followUpQuestion: string,
): ChatMessage[] {
  // Extract original user question
  const userEntry = entries.find(e => e.role === 'user');
  const originalQuestion = userEntry?.content ?? '';

  // Build formatted summary of the full discussion
  const parts: string[] = [];
  for (const entry of entries) {
    if (entry.role === 'model') {
      parts.push(`--- ${entry.displayName} (${entry.provider}) ---\n${entry.content}`);
    }
    if (entry.role === 'master_verdict') {
      parts.push(`--- Master Verdict ---\n${entry.content}`);
    }
    if (entry.role === 'follow_up_question') {
      parts.push(`--- Follow-up to ${entry.targetDisplayName} ---\n${entry.content}`);
    }
    if (entry.role === 'follow_up_answer') {
      parts.push(`--- ${entry.displayName} (Follow-up Response) ---\n${entry.content}`);
    }
  }

  return [
    { role: 'user', content: originalQuestion },
    { role: 'assistant', content: `Here is the full council discussion:\n\n${parts.join('\n\n')}` },
    { role: 'user', content: followUpQuestion },
  ];
}

function buildMasterVerdictPrompt(
  userQuestion: string,
  discussion: DiscussionEntry[],
): string {
  const opinions = discussion
    .filter((e) => e.role === 'model')
    .map((e) => {
      const m = e as Extract<DiscussionEntry, { role: 'model' }>;
      return `--- ${m.displayName} ---\n${m.content}`;
    })
    .join('\n\n');

  return `The user asked: "${userQuestion}"

The following AI council members have provided their analysis:

${opinions}

As the master judge, please synthesize all opinions and deliver your FINAL VERDICT. Consider:
1. Points of agreement across models
2. Points of disagreement and which position is stronger
3. Any factual errors in the responses
4. A clear, actionable recommendation

Provide your final verdict with clear reasoning.`;
}
