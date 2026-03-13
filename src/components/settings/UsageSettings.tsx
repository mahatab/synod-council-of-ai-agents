import { useState, useEffect, useCallback } from 'react';
import { BarChart3, RefreshCw, Loader2 } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSessionStore } from '../../stores/sessionStore';
import { PROVIDERS, getProviderColor } from '../../types';
import type { Provider, Session } from '../../types';
import * as tauri from '../../lib/tauri';
import { calculateModelCost, formatUsdCost } from '../../lib/pricing';

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

export default function UsageSettings() {
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

      {/* Summary stat cards */}
      {usageStats.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="p-3 rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
            <p className="text-xs text-[var(--color-text-tertiary)] mb-1">Total Tokens</p>
            <p className="text-lg font-semibold text-[var(--color-text-primary)]">
              {formatTokenCount(totalInput + totalOutput)}
            </p>
          </div>
          <div className="p-3 rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
            <p className="text-xs text-[var(--color-text-tertiary)] mb-1">Est. Cost</p>
            <p className="text-lg font-semibold text-[var(--color-text-primary)]">
              {hasAnyCost ? formatUsdCost(totalCost) : '—'}
            </p>
          </div>
          <div className="p-3 rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
            <p className="text-xs text-[var(--color-text-tertiary)] mb-1">Models Used</p>
            <p className="text-lg font-semibold text-[var(--color-text-primary)]">
              {usageStats.length}
            </p>
          </div>
        </div>
      )}

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
