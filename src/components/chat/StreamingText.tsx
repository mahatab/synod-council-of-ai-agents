import type { AnchorHTMLAttributes } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ExternalLink } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useSettingsStore } from '../../stores/settingsStore';

interface StreamingTextProps {
  content: string;
  isStreaming?: boolean;
}

/** Opens links in the system default browser using Tauri's opener plugin. */
function MarkdownLink({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (href) {
      e.preventDefault();
      e.stopPropagation();
      openUrl(href).catch((err) => {
        console.error('Failed to open URL:', err);
      });
    }
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5"
      {...props}
    >
      {children}
      <ExternalLink size={12} className="inline-block flex-shrink-0 opacity-50" />
    </a>
  );
}

const markdownComponents = {
  a: MarkdownLink,
};

export default function StreamingText({ content, isStreaming = false }: StreamingTextProps) {
  const cursorStyle = useSettingsStore((s) => s.settings.cursorStyle);

  return (
    <div className="markdown-content text-[15px] leading-relaxed text-[var(--color-text-primary)]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{content}</ReactMarkdown>
      {isStreaming && (
        <span
          className={`cursor-${cursorStyle} inline-block w-[3px] h-[1.1em] ml-1 rounded-sm bg-[var(--color-accent)] align-text-bottom`}
        />
      )}
    </div>
  );
}
