import { useState, useEffect } from 'react';
import { Bot, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { PROVIDERS, getProviderColor } from '../../types';
import type { DirectChatAgent, Provider } from '../../types';
import { hasApiKey } from '../../lib/tauri';
import { useSettingsStore } from '../../stores/settingsStore';

interface AgentPickerProps {
  onSelect: (agent: DirectChatAgent) => void;
}

interface ModelItem {
  provider: string;
  providerName: string;
  model: string;
  displayName: string;
  color: string;
  webSearch?: boolean;
}

export default function AgentPicker({ onSelect }: AgentPickerProps) {
  const [search, setSearch] = useState('');
  const [availableProviders, setAvailableProviders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const internetAccessEnabled = useSettingsStore((s) => s.settings.internetAccessEnabled);

  useEffect(() => {
    const checkProviders = async () => {
      const available = new Set<string>();
      await Promise.all(
        PROVIDERS.map(async (p) => {
          const has = await hasApiKey(p.keychainService);
          if (has) available.add(p.id);
        }),
      );
      setAvailableProviders(available);
      setLoading(false);
    };
    checkProviders();
  }, []);

  const allModels: ModelItem[] = PROVIDERS.flatMap((p) =>
    p.models.map((m) => ({
      provider: p.id,
      providerName: p.name,
      model: m.id,
      displayName: m.name,
      color: getProviderColor(p.id as Provider),
      webSearch: m.webSearch,
    })),
  );

  const filtered = search.trim()
    ? allModels.filter(
        (m) =>
          m.displayName.toLowerCase().includes(search.toLowerCase()) ||
          m.providerName.toLowerCase().includes(search.toLowerCase()),
      )
    : allModels;

  // Sort: available providers first
  const sorted = [...filtered].sort((a, b) => {
    const aAvail = availableProviders.has(a.provider) ? 0 : 1;
    const bAvail = availableProviders.has(b.provider) ? 0 : 1;
    return aAvail - bAvail;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-[var(--color-accent)] thinking-dot"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="text-center max-w-2xl w-full"
      >
        <img
          src="/synod-icon.png"
          alt="Synode"
          className="w-16 h-16 rounded-2xl mx-auto mb-6"
        />
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] mb-1">
          Direct Chat
        </h1>
        <p className="text-sm text-[var(--color-text-tertiary)] mb-6">
          Select a model to start a 1-on-1 conversation
        </p>

        {/* Search */}
        <div className="relative mb-4 max-w-sm mx-auto">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] pointer-events-none"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-[var(--color-bg-input)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-border-focus)] transition-colors"
          />
        </div>

        {/* Model grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[400px] overflow-y-auto">
          {sorted.map((m) => {
            const hasKey = availableProviders.has(m.provider);
            const blockedByWebSearch = internetAccessEnabled && !m.webSearch;
            const isAvailable = hasKey && !blockedByWebSearch;
            return (
              <button
                key={`${m.provider}-${m.model}`}
                onClick={() => {
                  if (isAvailable) {
                    onSelect({
                      provider: m.provider,
                      model: m.model,
                      displayName: m.displayName,
                    });
                  }
                }}
                disabled={!isAvailable}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[var(--radius-md)] border text-left transition-all ${
                  isAvailable
                    ? 'border-[var(--color-border-primary)] hover:border-[var(--color-border-focus)] hover:bg-[var(--color-bg-hover)] cursor-pointer'
                    : 'border-[var(--color-border-primary)] opacity-40 cursor-not-allowed'
                }`}
              >
                <div
                  className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: m.color + '20' }}
                >
                  <Bot size={14} style={{ color: m.color }} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                    {m.displayName}
                  </p>
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    {m.providerName}
                    {blockedByWebSearch ? ' · No web search' : !hasKey ? ' · No API key' : ''}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {sorted.length === 0 && (
          <p className="text-sm text-[var(--color-text-tertiary)] py-8">
            No models found matching "{search}"
          </p>
        )}
      </motion.div>
    </div>
  );
}
