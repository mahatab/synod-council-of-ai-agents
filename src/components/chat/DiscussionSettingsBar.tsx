import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, Globe } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { modelSupportsWebSearch } from '../../types';

interface SettingInfo {
  key: string;
  label: string;
  description: string;
}

const STYLE_INFO: Record<string, SettingInfo> = {
  sequential: {
    key: 'style',
    label: 'Sequential',
    description:
      'Each model sees previous responses and can build on, challenge, or refine them. Best for deep, iterative analysis.',
  },
  independent: {
    key: 'style',
    label: 'Independent',
    description:
      'Each model receives only the original question. Prevents groupthink and gives completely unbiased perspectives. The master model still sees all responses.',
  },
};

const DEPTH_INFO: Record<string, SettingInfo> = {
  thorough: {
    key: 'depth',
    label: 'Thorough',
    description:
      'Models provide detailed analysis with comprehensive explanations. Best for complex decisions (uses more tokens).',
  },
  concise: {
    key: 'depth',
    label: 'Concise',
    description:
      'Models give brief, focused responses with 2-3 key points only. Great for quick insights (saves tokens).',
  },
};

const MODE_INFO: Record<string, SettingInfo> = {
  upfront: {
    key: 'mode',
    label: 'Upfront',
    description:
      'Master model generates system prompts for all council models before the discussion starts. One API call, faster overall.',
  },
  dynamic: {
    key: 'mode',
    label: 'Dynamic',
    description:
      'Master model generates each system prompt right before that model responds, incorporating context from previous responses. More adaptive but uses more API calls.',
  },
};

export default function DiscussionSettingsBar() {
  const settings = useSettingsStore((s) => s.settings);
  const [openTooltip, setOpenTooltip] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const styleInfo = STYLE_INFO[settings.discussionStyle];
  const depthInfo = DEPTH_INFO[settings.discussionDepth];
  const modeInfo = MODE_INFO[settings.systemPromptMode];

  const chips = [styleInfo, depthInfo, modeInfo];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenTooltip(null);
      }
    }
    if (openTooltip) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openTooltip]);

  return (
    <div ref={barRef} className="px-6 py-2 bg-[var(--color-bg-primary)]">
      <div className="max-w-4xl mx-auto flex items-center justify-center gap-3">
        {chips.map((chip, i) => (
          <div key={chip.key} className="flex items-center gap-1">
            {i > 0 && (
              <span className="text-[var(--color-text-tertiary)] text-xs mr-2">&middot;</span>
            )}
            <span className="text-xs text-[var(--color-text-tertiary)]">
              {chip.label}
            </span>
            <div className="relative">
              <button
                onClick={() => setOpenTooltip(openTooltip === chip.key ? null : chip.key)}
                className="p-0.5 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] transition-colors"
              >
                <Info size={12} />
              </button>
              <AnimatePresence>
                {openTooltip === chip.key && (
                  <motion.div
                    className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 w-64 bg-[var(--color-bg-card)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] shadow-lg p-3"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                  >
                    <p className="text-xs text-[var(--color-text-secondary)] mb-2">
                      {chip.description}
                    </p>
                    <p className="text-[11px] text-[var(--color-text-tertiary)]">
                      Change in Settings &gt; Advanced
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ))}
        {settings.internetAccessEnabled && (() => {
          const skippedModels = settings.councilModels.filter(
            m => !modelSupportsWebSearch(m.provider, m.model)
          );
          return (
            <div className="flex items-center gap-1">
              <span className="text-[var(--color-text-tertiary)] text-xs mr-2">&middot;</span>
              <Globe size={12} className="text-[var(--color-accent)]" />
              <span className="text-xs text-[var(--color-accent)] font-medium">
                Internet
              </span>
              {skippedModels.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setOpenTooltip(openTooltip === 'internet' ? null : 'internet')}
                    className="p-0.5 rounded text-amber-500 hover:text-amber-400 transition-colors"
                  >
                    <Info size={12} />
                  </button>
                  <AnimatePresence>
                    {openTooltip === 'internet' && (
                      <motion.div
                        className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 w-72 bg-[var(--color-bg-card)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] shadow-lg p-3"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                      >
                        <p className="text-xs text-amber-500 font-medium mb-1">
                          {skippedModels.length} model{skippedModels.length > 1 ? 's' : ''} excluded
                        </p>
                        <p className="text-xs text-[var(--color-text-secondary)] mb-2">
                          These models don't support web search and won't participate in the council:
                        </p>
                        <ul className="space-y-0.5">
                          {skippedModels.map(m => (
                            <li key={`${m.provider}:${m.model}`} className="text-[11px] text-[var(--color-text-tertiary)]">
                              • {m.displayName}
                            </li>
                          ))}
                        </ul>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
