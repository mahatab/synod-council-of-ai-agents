export type Provider = 'anthropic' | 'openai' | 'google' | 'xai' | 'deepseek' | 'mistral' | 'together' | 'cohere';

export interface ModelConfig {
  provider: Provider;
  model: string;
  displayName: string;
  order: number;
}

export interface MasterModelConfig {
  provider: Provider;
  model: string;
}

export type SystemPromptMode = 'upfront' | 'dynamic';

export type DiscussionDepth = 'thorough' | 'concise';

export type DiscussionStyle = 'sequential' | 'independent';

export type ThemeMode = 'light' | 'dark' | 'system';

export type CursorStyle = 'ripple' | 'breathing' | 'orbit' | 'multi';

export interface AppSettings {
  councilModels: ModelConfig[];
  masterModel: MasterModelConfig;
  systemPromptMode: SystemPromptMode;
  discussionDepth: DiscussionDepth;
  discussionStyle: DiscussionStyle;
  theme: ThemeMode;
  cursorStyle: CursorStyle;
  sessionSavePath: string | null;
  setupCompleted: boolean;
}

export interface ChatMessage {
  role: string;
  content: string;
}

export interface UsageData {
  inputTokens: number;
  outputTokens: number;
}

export interface ClarifyingExchange {
  question: string;
  answer: string;
}

export interface DiscussionEntryUser {
  role: 'user';
  content: string;
}

export interface DiscussionEntryModel {
  role: 'model';
  provider: string;
  model: string;
  displayName: string;
  systemPrompt?: string;
  content: string;
  clarifyingExchange?: ClarifyingExchange[];
  usage?: UsageData;
}

export interface DiscussionEntryMasterVerdict {
  role: 'master_verdict';
  provider: string;
  model: string;
  content: string;
  usage?: UsageData;
}

export interface DiscussionEntryFollowUpQuestion {
  role: 'follow_up_question';
  content: string;
  targetProvider: string;
  targetModel: string;
  targetDisplayName: string;
}

export interface DiscussionEntryFollowUpAnswer {
  role: 'follow_up_answer';
  provider: string;
  model: string;
  displayName: string;
  content: string;
  usage?: UsageData;
}

export type DiscussionEntry =
  | DiscussionEntryUser
  | DiscussionEntryModel
  | DiscussionEntryMasterVerdict
  | DiscussionEntryFollowUpQuestion
  | DiscussionEntryFollowUpAnswer;

export interface CouncilConfig {
  models: ModelConfig[];
  masterModel: MasterModelConfig;
  systemPromptMode: SystemPromptMode;
}

export interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  userQuestion: string;
  councilConfig: CouncilConfig;
  discussion: DiscussionEntry[];
}

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface StreamToken {
  streamId: string;
  token: string;
  done: boolean;
  error?: string;
  usage?: UsageData;
}

export interface StreamChatResult {
  content: string;
  usage?: UsageData;
}

export type CouncilState =
  | 'idle'
  | 'user_input'
  | 'generating_system_prompts'
  | 'model_turn'
  | 'clarifying_qa'
  | 'master_verdict'
  | 'complete'
  | 'follow_up'
  | 'error';

export interface ProviderInfo {
  id: Provider;
  name: string;
  keychainService: string;
  models: { id: string; name: string }[];
  apiKeyUrl: string;
  apiKeySteps: string[];
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    keychainService: 'com.council-of-ai-agents.anthropic',
    models: [
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
    ],
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    apiKeySteps: [
      'Go to console.anthropic.com',
      'Sign in or create an account',
      'Navigate to Settings > API Keys',
      'Click "Create Key" and give it a name',
      'Copy the key (it starts with "sk-ant-")',
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    keychainService: 'com.council-of-ai-agents.openai',
    models: [
      { id: 'gpt-5.2', name: 'GPT-5.2' },
      { id: 'gpt-4.1', name: 'GPT-4.1' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
      { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano' },
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'o3', name: 'o3' },
      { id: 'o3-mini', name: 'o3-mini' },
      { id: 'o4-mini', name: 'o4-mini' },
    ],
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    apiKeySteps: [
      'Go to platform.openai.com',
      'Sign in or create an account',
      'Navigate to API Keys in the sidebar',
      'Click "Create new secret key"',
      'Copy the key (it starts with "sk-")',
    ],
  },
  {
    id: 'google',
    name: 'Google',
    keychainService: 'com.council-of-ai-agents.google',
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
    ],
    apiKeyUrl: 'https://aistudio.google.com/apikey',
    apiKeySteps: [
      'Go to aistudio.google.com',
      'Sign in with your Google account',
      'Click "Get API Key" in the top bar',
      'Click "Create API Key"',
      'Select or create a Google Cloud project',
      'Copy the generated API key',
    ],
  },
  {
    id: 'xai',
    name: 'xAI',
    keychainService: 'com.council-of-ai-agents.xai',
    models: [
      { id: 'grok-4-0709', name: 'Grok-4' },
      { id: 'grok-3', name: 'Grok-3' },
      { id: 'grok-3-mini', name: 'Grok-3 Mini' },
    ],
    apiKeyUrl: 'https://console.x.ai',
    apiKeySteps: [
      'Go to console.x.ai',
      'Sign in with your X (Twitter) account',
      'Navigate to API Keys section',
      'Click "Create API Key"',
      'Copy the generated key',
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    keychainService: 'com.council-of-ai-agents.deepseek',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3 (Chat)' },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1 (Reasoner)' },
    ],
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    apiKeySteps: [
      'Go to platform.deepseek.com',
      'Sign in or create an account',
      'Navigate to API Keys section',
      'Click "Create new API key"',
      'Copy the generated key (it starts with "sk-")',
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    keychainService: 'com.council-of-ai-agents.mistral',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large' },
      { id: 'mistral-medium-latest', name: 'Mistral Medium' },
      { id: 'mistral-small-latest', name: 'Mistral Small' },
      { id: 'codestral-latest', name: 'Codestral' },
    ],
    apiKeyUrl: 'https://console.mistral.ai/api-keys',
    apiKeySteps: [
      'Go to console.mistral.ai',
      'Sign in or create an account',
      'Navigate to API Keys section',
      'Click "Create new key"',
      'Copy the generated API key',
    ],
  },
  {
    id: 'together',
    name: 'Together AI',
    keychainService: 'com.council-of-ai-agents.together',
    models: [
      { id: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8', name: 'Llama 4 Maverick' },
      { id: 'meta-llama/Llama-4-Scout-17B-16E-Instruct', name: 'Llama 4 Scout' },
    ],
    apiKeyUrl: 'https://api.together.xyz/settings/api-keys',
    apiKeySteps: [
      'Go to api.together.xyz',
      'Sign in or create an account',
      'Navigate to Settings > API Keys',
      'Copy your API key',
    ],
  },
  {
    id: 'cohere',
    name: 'Cohere',
    keychainService: 'com.council-of-ai-agents.cohere',
    models: [
      { id: 'command-a-03-2025', name: 'Command A' },
      { id: 'command-r-plus-08-2024', name: 'Command R+' },
    ],
    apiKeyUrl: 'https://dashboard.cohere.com/api-keys',
    apiKeySteps: [
      'Go to dashboard.cohere.com',
      'Sign in or create an account',
      'Navigate to API Keys section',
      'Click "Create Trial Key" or "Create Production Key"',
      'Copy the generated API key',
    ],
  },
];

export function getProviderInfo(providerId: Provider): ProviderInfo {
  return PROVIDERS.find((p) => p.id === providerId)!;
}

export function getProviderColor(provider: Provider): string {
  switch (provider) {
    case 'anthropic':
      return '#D97757';
    case 'openai':
      return '#10A37F';
    case 'google':
      return '#4285F4';
    case 'xai':
      return '#1DA1F2';
    case 'deepseek':
      return '#536AF6';
    case 'mistral':
      return '#FF7000';
    case 'together':
      return '#6366F1';
    case 'cohere':
      return '#39594D';
  }
}
