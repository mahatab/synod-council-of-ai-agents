import { useState } from 'react';
import { Bot, Copy, Check } from 'lucide-react';
import StreamingText from './StreamingText';
import ThinkingIndicator from './ThinkingIndicator';
import { getProviderColor } from '../../types';
import type { Provider } from '../../types';

interface ModelResponseProps {
  provider: string;
  model: string;
  displayName: string;
  content: string;
  isStreaming?: boolean;
  isThinking?: boolean;
  clarifyingExchange?: { question: string; answer: string }[];
}

export default function ModelResponse({
  provider,
  displayName,
  content,
  isStreaming = false,
  isThinking = false,
  clarifyingExchange,
}: ModelResponseProps) {
  const color = getProviderColor(provider as Provider);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="model-response-enter">
      {/* Sticky header — pins to top of scroll area while this response is visible */}
      <div className="sticky top-0 z-10 bg-[var(--color-bg-primary)]">
        <div className="px-6 py-2.5 flex items-center gap-3">
          <div
            className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
            style={{ backgroundColor: `${color}20` }}
          >
            <Bot size={14} style={{ color }} />
          </div>
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">
            {displayName}
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{
              backgroundColor: `${color}15`,
              color,
            }}
          >
            {provider}
          </span>
          {content && !isThinking && (
            <button
              onClick={handleCopy}
              className="ml-auto p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-bg-hover)] transition-colors"
              title={copied ? 'Copied!' : 'Copy response'}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          )}
        </div>
        <div className="h-px bg-[var(--color-border-primary)]" />
      </div>

      {/* Content area */}
      <div className="px-6 py-4">
        {isThinking && !content ? (
          <ThinkingIndicator modelName={displayName} color={color} />
        ) : (
          <>
            {clarifyingExchange && clarifyingExchange.length > 0 && (
              <div className="mb-3 space-y-2">
                {clarifyingExchange.map((exchange, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)]"
                  >
                    <p className="text-sm text-[var(--color-text-secondary)] mb-1">
                      <span className="font-medium">Q:</span> {exchange.question}
                    </p>
                    <p className="text-sm text-[var(--color-text-primary)]">
                      <span className="font-medium">A:</span> {exchange.answer}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <StreamingText content={content} isStreaming={isStreaming} />
          </>
        )}
      </div>
    </div>
  );
}
