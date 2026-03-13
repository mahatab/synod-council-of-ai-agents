import { useState } from 'react';
import { Bot, Key, Palette, Sliders, HardDrive, MessageCircle, BarChart3 } from 'lucide-react';
import Modal from '../common/Modal';
import ModelManager from './ModelManager';
import ApiKeyManager from './ApiKeyManager';
import AppearanceSettings from './AppearanceSettings';
import AdvancedSettings from './AdvancedSettings';
import SessionSettings from './SessionSettings';
import TelegramSettings from './TelegramSettings';
import UsageSettings from './UsageSettings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'models' | 'usage' | 'keys' | 'appearance' | 'advanced' | 'sessions' | 'telegram';

type TabEntry = { id: SettingsTab; label: string; icon: typeof Bot };

const tabs: TabEntry[] = [
  { id: 'models', label: 'Models', icon: Bot },
  { id: 'keys', label: 'API Keys', icon: Key },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'sessions', label: 'Sessions', icon: HardDrive },
  { id: 'advanced', label: 'Advanced', icon: Sliders },
  { id: 'telegram', label: 'Telegram', icon: MessageCircle },
];

const bottomTabs: TabEntry[] = [
  { id: 'usage', label: 'Usage', icon: BarChart3 },
];

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('models');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings" size="lg">
      <div className="flex gap-6 min-h-[400px]">
        {/* Tab navigation */}
        <div className="w-40 flex-shrink-0 space-y-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-[var(--radius-md)] transition-colors ${
                activeTab === id
                  ? 'bg-[var(--color-bg-active)] text-[var(--color-text-primary)] font-medium'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
          <div className="border-t border-[var(--color-border-primary)] my-1" />
          {bottomTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-[var(--radius-md)] transition-colors ${
                activeTab === id
                  ? 'bg-[var(--color-bg-active)] text-[var(--color-text-primary)] font-medium'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 min-w-0">
          {activeTab === 'models' && <ModelManager />}
          {activeTab === 'usage' && <UsageSettings />}
          {activeTab === 'keys' && <ApiKeyManager />}
          {activeTab === 'appearance' && <AppearanceSettings />}
          {activeTab === 'sessions' && <SessionSettings />}
          {activeTab === 'advanced' && <AdvancedSettings />}
          {activeTab === 'telegram' && <TelegramSettings />}
        </div>
      </div>
    </Modal>
  );
}
