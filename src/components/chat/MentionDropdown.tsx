import { useState, useEffect, useRef } from 'react';
import { Bot, Crown } from 'lucide-react';
import { getProviderColor } from '../../types';
import type { Provider, ModelConfig, MasterModelConfig } from '../../types';

export interface MentionModel {
  provider: string;
  model: string;
  displayName: string;
  isMaster?: boolean;
}

interface MentionDropdownProps {
  query: string;
  models: ModelConfig[];
  masterModel: MasterModelConfig;
  onSelect: (model: MentionModel) => void;
  onClose: () => void;
}

export default function MentionDropdown({
  query,
  models,
  masterModel,
  onSelect,
  onClose,
}: MentionDropdownProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Build full list: council models + master
  const allModels: MentionModel[] = [
    ...models.map((m) => ({
      provider: m.provider,
      model: m.model,
      displayName: m.displayName,
    })),
    {
      provider: masterModel.provider,
      model: masterModel.model,
      displayName: getMasterDisplayName(masterModel),
      isMaster: true,
    },
  ];

  // Filter by query
  const filtered = query
    ? allModels.filter((m) =>
        m.displayName.toLowerCase().includes(query.toLowerCase()),
      )
    : allModels;

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && filtered.length > 0) {
        e.preventDefault();
        onSelect(filtered[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filtered, selectedIndex, onSelect, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.children[selectedIndex] as HTMLElement;
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Click outside to close
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-2 mx-4 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] shadow-lg overflow-hidden z-50"
      style={{ maxHeight: '240px', overflowY: 'auto' }}
    >
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)]">
        <span className="text-xs font-medium text-[var(--color-text-tertiary)]">
          Mention a model to follow up
        </span>
      </div>
      {filtered.map((model, i) => {
        const color = getProviderColor(model.provider as Provider);
        return (
          <button
            key={`${model.provider}:${model.model}`}
            onClick={() => onSelect(model)}
            onMouseEnter={() => setSelectedIndex(i)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
              i === selectedIndex
                ? 'bg-[var(--color-bg-hover)]'
                : 'hover:bg-[var(--color-bg-hover)]'
            }`}
          >
            <div
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${color}20` }}
            >
              {model.isMaster ? (
                <Crown size={12} style={{ color }} />
              ) : (
                <Bot size={12} style={{ color }} />
              )}
            </div>
            <span className="text-sm font-medium text-[var(--color-text-primary)] flex-1">
              {model.displayName}
            </span>
            <span
              className="text-xs px-1.5 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: `${color}15`, color }}
            >
              {model.provider}
            </span>
            {model.isMaster && (
              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                Master
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function getMasterDisplayName(master: MasterModelConfig): string {
  // Try to find a friendly name from the model ID
  const modelId = master.model;
  if (modelId.includes('claude')) {
    if (modelId.includes('opus')) return 'Claude Opus';
    if (modelId.includes('sonnet')) return 'Claude Sonnet';
    if (modelId.includes('haiku')) return 'Claude Haiku';
    return 'Claude';
  }
  if (modelId.includes('gpt')) return modelId.toUpperCase();
  if (modelId.includes('gemini')) return 'Gemini';
  if (modelId.includes('grok')) return 'Grok';
  // Fallback: capitalize the model ID
  return modelId;
}
