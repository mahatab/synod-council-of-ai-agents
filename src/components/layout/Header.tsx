import { Settings } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useSessionStore } from '../../stores/sessionStore';

interface HeaderProps {
  onOpenSettings: () => void;
}

export default function Header({ onOpenSettings }: HeaderProps) {
  const activeSession = useSessionStore((s) => s.activeSession);
  const title = activeSession?.title || 'New Session';

  const handleDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.titlebar-no-drag')) return;
    getCurrentWindow().startDragging();
  };

  return (
    <div
      onMouseDown={handleDrag}
      className="titlebar-drag-region h-12 flex items-center justify-between px-4 bg-[var(--color-bg-primary)] border-b border-[var(--color-border-primary)]"
    >
      <span className="text-sm font-bold text-[var(--color-text-primary)] truncate pl-16">
        {title}
      </span>
      <button
        onClick={onOpenSettings}
        className="titlebar-no-drag p-2 rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
        title="Settings"
      >
        <Settings size={18} />
      </button>
    </div>
  );
}
