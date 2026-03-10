import { motion, AnimatePresence } from 'framer-motion';
import { Check, AlertCircle } from 'lucide-react';
import { getProviderColor } from '../../types';
import type { Provider, ModelConfig } from '../../types';

type ModelStatus = 'thinking' | 'streaming' | 'complete' | 'error';

interface ParallelStatusOverlayProps {
  parallelStreams: Map<number, { content: string; done: boolean }>;
  models: ModelConfig[];
  model0Complete: boolean;
}

function deriveStatus(
  stream: { content: string; done: boolean } | undefined,
  isModel0: boolean,
): ModelStatus {
  if (isModel0) return 'complete';
  if (!stream) return 'thinking';
  if (stream.done && stream.content) return 'complete';
  if (stream.done && !stream.content) return 'error';
  if (stream.content) return 'streaming';
  return 'thinking';
}

function statusLabel(status: ModelStatus): string {
  switch (status) {
    case 'thinking':
      return 'thinking';
    case 'streaming':
      return 'writing';
    case 'complete':
      return 'done';
    case 'error':
      return 'failed';
  }
}

function StatusDot({ status, color }: { status: ModelStatus; color: string }) {
  if (status === 'complete') {
    return (
      <motion.div
        className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center"
        style={{ backgroundColor: `${color}25` }}
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
      >
        <Check size={10} style={{ color }} strokeWidth={3} />
      </motion.div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center bg-red-100 dark:bg-red-900/30">
        <AlertCircle size={10} className="text-red-500" strokeWidth={3} />
      </div>
    );
  }

  if (status === 'streaming') {
    return (
      <motion.div
        className="flex-shrink-0 w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: color }}
        animate={{
          scale: [1, 1.4, 1],
          opacity: [0.6, 1, 0.6],
        }}
        transition={{
          duration: 1.0,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    );
  }

  // thinking
  return (
    <motion.div
      className="flex-shrink-0 w-2.5 h-2.5 rounded-full"
      style={{ backgroundColor: color }}
      animate={{
        opacity: [0.3, 1, 0.3],
        scale: [0.85, 1.1, 0.85],
      }}
      transition={{
        duration: 1.4,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
}

export default function ParallelStatusOverlay({
  parallelStreams,
  models,
  model0Complete,
}: ParallelStatusOverlayProps) {
  const modelStatuses = models.map((model, index) => ({
    model,
    index,
    status: deriveStatus(
      parallelStreams.get(index),
      index === 0 && model0Complete,
    ),
    color: getProviderColor(model.provider as Provider),
  }));

  const completedCount = modelStatuses.filter(
    (m) => m.status === 'complete',
  ).length;
  const totalCount = models.length;

  return (
    <AnimatePresence>
      <motion.div
        className="sticky bottom-4 z-20 mx-6 my-4"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="bg-[var(--color-bg-primary)]/80 backdrop-blur-md border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] px-4 py-3 shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide">
              Council Progress
            </span>
            <span className="text-xs font-medium text-[var(--color-text-tertiary)]">
              {completedCount}/{totalCount}
            </span>
          </div>

          {/* Model chips */}
          <div className="flex flex-wrap gap-2">
            {modelStatuses.map(({ model, index, status, color }) => (
              <div
                key={`status-${index}`}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)]/50"
              >
                <StatusDot status={status} color={color} />
                <span className="text-xs font-medium text-[var(--color-text-secondary)] truncate max-w-[100px]">
                  {model.displayName}
                </span>
                <span
                  className="text-[10px] font-medium"
                  style={{
                    color:
                      status === 'complete'
                        ? color
                        : status === 'error'
                          ? '#EF4444'
                          : 'var(--color-text-tertiary)',
                  }}
                >
                  {statusLabel(status)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
