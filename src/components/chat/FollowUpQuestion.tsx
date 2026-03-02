import { MessageCircleReply } from 'lucide-react';
import { getProviderColor } from '../../types';
import type { Provider } from '../../types';

interface FollowUpQuestionProps {
  content: string;
  targetProvider: string;
  targetDisplayName: string;
}

export default function FollowUpQuestion({
  content,
  targetProvider,
  targetDisplayName,
}: FollowUpQuestionProps) {
  const color = getProviderColor(targetProvider as Provider);

  return (
    <div className="flex gap-4 px-6 py-5">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center">
        <MessageCircleReply size={16} className="text-[var(--color-text-secondary)]" />
      </div>
      <div className="flex-1 pt-1">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-medium text-[var(--color-text-tertiary)]">
            Follow-up to
          </span>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${color}15`, color }}
          >
            @{targetDisplayName}
          </span>
        </div>
        <p className="text-[15px] leading-relaxed text-[var(--color-text-primary)]">
          {content}
        </p>
      </div>
    </div>
  );
}
