import { useState, useEffect, useCallback } from 'react';
import { GripVertical, Plus, Trash2, Crown, BarChart3, RefreshCw, Loader2 } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Button from '../common/Button';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSessionStore } from '../../stores/sessionStore';
import { PROVIDERS, getProviderColor } from '../../types';
import type { ModelConfig, Provider, MasterModelConfig, Session } from '../../types';
import * as tauri from '../../lib/tauri';
import { calculateModelCost, formatUsdCost } from '../../lib/pricing';

interface SortableModelProps {
  model: ModelConfig;
  isFirst: boolean;
  onRemove: () => void;
}

function SortableModel({ model, isFirst, onRemove }: SortableModelProps) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: `${model.provider}:${model.model}` });

  const color = getProviderColor(model.provider);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-card)]"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
      >
        <GripVertical size={16} />
      </button>

      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
            {model.displayName}
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded font-medium"
            style={{ backgroundColor: `${color}15`, color }}
          >
            {model.provider}
          </span>
          {isFirst && (
            <span className="text-xs text-[var(--color-accent)] font-medium">
              (Can ask questions)
            </span>
          )}
        </div>
        <span className="text-xs text-[var(--color-text-tertiary)]">{model.model}</span>
      </div>

      <button
        onClick={onRemove}
        className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] transition-colors"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

interface ModelUsageStats {
  provider: string;
  model: string;
  displayName: string;
  inputTokens: number;
  outputTokens: number;
  isMaster: boolean;
  inputUsd: number | null;
  outputUsd: number | null;
  totalUsd: number | null;
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toLocaleString();
}

function getMonthBounds(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function getDaysUntilReset(): number {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return lastDay.getDate() - now.getDate();
}

function getMonthLabel(): string {
  const { start, end } = getMonthBounds();
  const monthName = start.toLocaleDateString('en-US', { month: 'short' });
  const year = start.getFullYear();
  return `${monthName} 1 \u2013 ${monthName} ${end.getDate()}, ${year}`;
}

function TokenUsageSection() {
  const { sessions } = useSessionStore();
  const settings = useSettingsStore((s) => s.settings);
  const [usageStats, setUsageStats] = useState<ModelUsageStats[]>([]);
  const [loading, setLoading] = useState(false);

  const loadUsageStats = useCallback(async () => {
    setLoading(true);
    try {
      const { start } = getMonthBounds();

      // Filter sessions from current month
      const currentMonthSessions = sessions.filter((s) => {
        const sessionDate = new Date(s.createdAt);
        return sessionDate >= start;
      });

      // Load full session data for each current-month session
      const fullSessions: Session[] = [];
      for (const summary of currentMonthSessions) {
        try {
          const session = await tauri.loadSession(
            summary.id,
            settings.sessionSavePath,
          );
          fullSessions.push(session);
        } catch {
          // Skip sessions that fail to load
        }
      }

      // Aggregate usage by provider:model
      const usageMap = new Map<
        string,
        { provider: string; model: string; displayName: string; input: number; output: number; isMaster: boolean }
      >();

      for (const session of fullSessions) {
        for (const entry of session.discussion) {
          if (entry.role === 'model' && entry.usage) {
            const key = `council:${entry.provider}:${entry.model}`;
            const existing = usageMap.get(key);
            if (existing) {
              existing.input += entry.usage.inputTokens;
              existing.output += entry.usage.outputTokens;
            } else {
              usageMap.set(key, {
                provider: entry.provider,
                model: entry.model,
                displayName: entry.displayName,
                input: entry.usage.inputTokens,
                output: entry.usage.outputTokens,
                isMaster: false,
              });
            }
          } else if (entry.role === 'master_verdict' && entry.usage) {
            const key = `master:${entry.provider}:${entry.model}`;
            const existing = usageMap.get(key);
            if (existing) {
              existing.input += entry.usage.inputTokens;
              existing.output += entry.usage.outputTokens;
            } else {
              // Try to find a display name for the master model
              const providerInfo = PROVIDERS.find((p) => p.id === entry.provider);
              const modelInfo = providerInfo?.models.find((m) => m.id === entry.model);
              usageMap.set(key, {
                provider: entry.provider,
                model: entry.model,
                displayName: modelInfo?.name ?? entry.model,
                input: entry.usage.inputTokens,
                output: entry.usage.outputTokens,
                isMaster: true,
              });
            }
          }
        }
      }

      // Convert to array, compute costs, and sort by total tokens descending
      const stats: ModelUsageStats[] = Array.from(usageMap.values())
        .map((v) => {
          const cost = calculateModelCost(v.model, v.input, v.output);
          return {
            provider: v.provider,
            model: v.model,
            displayName: v.displayName,
            inputTokens: v.input,
            outputTokens: v.output,
            isMaster: v.isMaster,
            inputUsd: cost?.inputUsd ?? null,
            outputUsd: cost?.outputUsd ?? null,
            totalUsd: cost?.totalUsd ?? null,
          };
        })
        .sort((a, b) => (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens));

      setUsageStats(stats);
    } catch (err) {
      console.error('Failed to load usage stats:', err);
    } finally {
      setLoading(false);
    }
  }, [sessions, settings.sessionSavePath]);

  // Load on mount and when sessions change
  useEffect(() => {
    if (sessions.length > 0) {
      loadUsageStats();
    } else {
      setUsageStats([]);
    }
  }, [sessions.length, loadUsageStats]);

  const daysUntilReset = getDaysUntilReset();
  const totalInput = usageStats.reduce((sum, s) => sum + s.inputTokens, 0);
  const totalOutput = usageStats.reduce((sum, s) => sum + s.outputTokens, 0);
  const totalCost = usageStats.reduce((sum, s) => sum + (s.totalUsd ?? 0), 0);
  const hasAnyCost = usageStats.some((s) => s.totalUsd !== null);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-[var(--color-accent)]" />
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Token Usage
          </h3>
        </div>
        <button
          onClick={loadUsageStats}
          disabled={loading}
          className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors disabled:opacity-50"
          title="Refresh usage data"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-[var(--color-text-tertiary)]">
          {getMonthLabel()}
        </p>
        <p className="text-xs text-[var(--color-text-tertiary)]">
          Resets in {daysUntilReset} day{daysUntilReset !== 1 ? 's' : ''}
        </p>
      </div>

      {usageStats.length === 0 && !loading ? (
        <div className="p-4 rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] text-center">
          <p className="text-xs text-[var(--color-text-tertiary)]">
            No usage data this month
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {usageStats.map((stat) => {
            const color = getProviderColor(stat.provider as Provider);
            const total = stat.inputTokens + stat.outputTokens;
            return (
              <div
                key={`${stat.isMaster ? 'master' : 'council'}:${stat.provider}:${stat.model}`}
                className="p-3 rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-card)]"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                    {stat.displayName}
                  </span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded font-medium"
                    style={{ backgroundColor: `${color}15`, color }}
                  >
                    {stat.provider}
                  </span>
                  {stat.isMaster && (
                    <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-[var(--color-accent-light)] text-[var(--color-accent)]">
                      Master
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-[var(--color-text-tertiary)]">
                  <span>
                    In: <span className="text-[var(--color-text-secondary)] font-medium">{formatTokenCount(stat.inputTokens)}</span>
                  </span>
                  <span>
                    Out: <span className="text-[var(--color-text-secondary)] font-medium">{formatTokenCount(stat.outputTokens)}</span>
                  </span>
                  <span className="ml-auto">
                    Total: <span className="text-[var(--color-text-primary)] font-semibold">{formatTokenCount(total)}</span>
                  </span>
                </div>
                {stat.totalUsd !== null && (
                  <div className="flex items-center justify-end mt-1 text-xs text-[var(--color-text-tertiary)]">
                    <span>
                      Est. cost: <span className="text-[var(--color-text-primary)] font-semibold">{formatUsdCost(stat.totalUsd)}</span>
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Grand total */}
          {usageStats.length > 1 && (
            <div className="pt-2 mt-2 border-t border-[var(--color-border-primary)]">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--color-text-tertiary)]">All models total</span>
                <div className="flex items-center gap-4 text-[var(--color-text-tertiary)]">
                  <span>
                    In: <span className="text-[var(--color-text-secondary)] font-medium">{formatTokenCount(totalInput)}</span>
                  </span>
                  <span>
                    Out: <span className="text-[var(--color-text-secondary)] font-medium">{formatTokenCount(totalOutput)}</span>
                  </span>
                  <span>
                    Total: <span className="text-[var(--color-text-primary)] font-semibold">{formatTokenCount(totalInput + totalOutput)}</span>
                  </span>
                </div>
              </div>
              {hasAnyCost && (
                <div className="flex items-center justify-end mt-1 text-xs text-[var(--color-text-tertiary)]">
                  <span>
                    Est. total cost: <span className="text-[var(--color-text-primary)] font-semibold">{formatUsdCost(totalCost)}</span>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ModelManager() {
  const { settings, updateSettings } = useSettingsStore();
  const [showAddModel, setShowAddModel] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<Provider>('anthropic');
  const [selectedModel, setSelectedModel] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = settings.councilModels.findIndex(
        (m) => `${m.provider}:${m.model}` === active.id,
      );
      const newIndex = settings.councilModels.findIndex(
        (m) => `${m.provider}:${m.model}` === over.id,
      );
      const reordered = arrayMove(settings.councilModels, oldIndex, newIndex).map(
        (m, i) => ({ ...m, order: i + 1 }),
      );
      updateSettings({ councilModels: reordered });
    }
  };

  const handleAddModel = () => {
    if (!selectedModel) return;

    const provider = PROVIDERS.find((p) => p.id === selectedProvider)!;
    const model = provider.models.find((m) => m.id === selectedModel)!;

    // Check for duplicates
    const exists = settings.councilModels.some(
      (m) => m.provider === selectedProvider && m.model === selectedModel,
    );
    if (exists) return;

    const newModel: ModelConfig = {
      provider: selectedProvider,
      model: selectedModel,
      displayName: model.name,
      order: settings.councilModels.length + 1,
    };

    updateSettings({ councilModels: [...settings.councilModels, newModel] });
    setShowAddModel(false);
    setSelectedModel('');
  };

  const handleRemoveModel = (index: number) => {
    const updated = settings.councilModels
      .filter((_, i) => i !== index)
      .map((m, i) => ({ ...m, order: i + 1 }));
    updateSettings({ councilModels: updated });
  };

  const handleMasterModelChange = (provider: Provider, model: string) => {
    const providerInfo = PROVIDERS.find((p) => p.id === provider)!;
    const modelInfo = providerInfo.models.find((m) => m.id === model);
    if (modelInfo) {
      const masterModel: MasterModelConfig = { provider, model };
      updateSettings({ masterModel });
    }
  };

  return (
    <div className="space-y-6">
      {/* Council Models */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">
          Council Models
        </h3>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
          Drag to reorder. The first model can ask clarifying questions.
        </p>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={settings.councilModels.map(
              (m) => `${m.provider}:${m.model}`,
            )}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2 mb-3">
              {settings.councilModels.map((model, i) => (
                <SortableModel
                  key={`${model.provider}:${model.model}`}
                  model={model}
                  isFirst={i === 0}
                  onRemove={() => handleRemoveModel(i)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {showAddModel ? (
          <div className="p-3 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)] space-y-2">
            <select
              value={selectedProvider}
              onChange={(e) => {
                setSelectedProvider(e.target.value as Provider);
                setSelectedModel('');
              }}
              className="w-full px-3 py-1.5 text-sm bg-[var(--color-bg-input)] border border-[var(--color-border-primary)] rounded-[var(--radius-sm)] text-[var(--color-text-primary)]"
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3 py-1.5 text-sm bg-[var(--color-bg-input)] border border-[var(--color-border-primary)] rounded-[var(--radius-sm)] text-[var(--color-text-primary)]"
            >
              <option value="">Select model...</option>
              {PROVIDERS.find((p) => p.id === selectedProvider)?.models.map(
                (m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ),
              )}
            </select>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAddModel} disabled={!selectedModel}>
                Add
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowAddModel(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowAddModel(true)}
          >
            <Plus size={14} /> Add Model
          </Button>
        )}
      </div>

      {/* Master Model */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Crown size={14} className="text-[var(--color-accent)]" />
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Master Model
          </h3>
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
          Delivers the final verdict after all council models have responded
        </p>

        <div className="flex gap-2">
          <select
            value={settings.masterModel.provider}
            onChange={(e) => {
              const provider = e.target.value as Provider;
              const firstModel = PROVIDERS.find((p) => p.id === provider)?.models[0];
              if (firstModel) {
                handleMasterModelChange(provider, firstModel.id);
              }
            }}
            className="px-3 py-1.5 text-sm bg-[var(--color-bg-input)] border border-[var(--color-border-primary)] rounded-[var(--radius-sm)] text-[var(--color-text-primary)]"
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={settings.masterModel.model}
            onChange={(e) =>
              handleMasterModelChange(settings.masterModel.provider, e.target.value)
            }
            className="flex-1 px-3 py-1.5 text-sm bg-[var(--color-bg-input)] border border-[var(--color-border-primary)] rounded-[var(--radius-sm)] text-[var(--color-text-primary)]"
          >
            {PROVIDERS.find((p) => p.id === settings.masterModel.provider)?.models.map(
              (m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ),
            )}
          </select>
        </div>
      </div>

      {/* Token Usage */}
      <TokenUsageSection />
    </div>
  );
}
