import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Check, Info } from 'lucide-react';
import Button from '../common/Button';
import ApiKeyInfoPopover from '../settings/ApiKeyInfoPopover';
import { useSettingsStore } from '../../stores/settingsStore';
import { PROVIDERS, getProviderColor } from '../../types';
import type { Provider, ModelConfig, MasterModelConfig } from '../../types';
import * as tauri from '../../lib/tauri';

type Step = 'welcome' | 'models' | 'keys' | 'master' | 'complete';

const steps: Step[] = ['welcome', 'models', 'keys', 'master', 'complete'];

export default function SetupWizard() {
  const { updateSettings } = useSettingsStore();
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [selectedModels, setSelectedModels] = useState<ModelConfig[]>([]);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [masterModel, setMasterModel] = useState<MasterModelConfig>({
    provider: 'anthropic',
    model: 'claude-opus-4-6',
  });
  const [openInfo, setOpenInfo] = useState<string | null>(null);

  const stepIndex = steps.indexOf(currentStep);

  const next = () => {
    if (stepIndex < steps.length - 1) {
      setCurrentStep(steps[stepIndex + 1]);
    }
  };

  const back = () => {
    if (stepIndex > 0) {
      setCurrentStep(steps[stepIndex - 1]);
    }
  };

  const toggleModel = (provider: Provider, modelId: string, modelName: string) => {
    const exists = selectedModels.find(
      (m) => m.provider === provider && m.model === modelId,
    );
    if (exists) {
      setSelectedModels((prev) =>
        prev.filter((m) => !(m.provider === provider && m.model === modelId)),
      );
    } else {
      setSelectedModels((prev) => [
        ...prev,
        {
          provider,
          model: modelId,
          displayName: modelName,
          order: prev.length + 1,
        },
      ]);
    }
  };

  const handleComplete = async () => {
    // Save API keys to keychain
    for (const [providerId, key] of Object.entries(apiKeys)) {
      if (key.trim()) {
        const provider = PROVIDERS.find((p) => p.id === providerId);
        if (provider) {
          await tauri.saveApiKey(provider.keychainService, key.trim());
        }
      }
    }

    // Save settings
    await updateSettings({
      councilModels: selectedModels.map((m, i) => ({ ...m, order: i + 1 })),
      masterModel,
      setupCompleted: true,
    });
  };

  // Get unique providers from selected models
  const selectedProviders = [
    ...new Set(selectedModels.map((m) => m.provider)),
  ];

  return (
    <div className="flex items-center justify-center h-screen bg-[var(--color-bg-primary)]">
      <motion.div
        className="w-full max-w-xl mx-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((step, i) => (
            <div
              key={step}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i <= stepIndex
                  ? 'w-8 bg-[var(--color-accent)]'
                  : 'w-4 bg-[var(--color-bg-tertiary)]'
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="bg-[var(--color-bg-card)] rounded-[var(--radius-xl)] border border-[var(--color-border-primary)] shadow-lg p-8"
          >
            {currentStep === 'welcome' && (
              <div className="text-center">
                <img
                  src="/synod-icon.png"
                  alt="Synode"
                  className="w-16 h-16 rounded-2xl mx-auto mb-6"
                />
                <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-1">
                  Welcome to Synode
                </h1>
                <p className="text-sm text-[var(--color-text-tertiary)] mb-3">
                  Council of AI Agents
                </p>
                <p className="text-[var(--color-text-secondary)] mb-8 leading-relaxed">
                  Get insights from multiple AI models working together. Let's
                  set up your council in a few simple steps.
                </p>
                <Button onClick={next} size="lg">
                  Get Started <ChevronRight size={18} />
                </Button>
              </div>
            )}

            {currentStep === 'models' && (
              <div>
                <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">
                  Choose Your Council
                </h2>
                <p className="text-sm text-[var(--color-text-secondary)] mb-6">
                  Select which AI models should participate in discussions
                </p>

                <div className="space-y-4 mb-6 max-h-[350px] overflow-y-auto">
                  {PROVIDERS.map((provider) => (
                    <div key={provider.id}>
                      <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2 flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{
                            backgroundColor: getProviderColor(provider.id),
                          }}
                        />
                        {provider.name}
                      </h3>
                      <div className="space-y-1">
                        {provider.models.map((model) => {
                          const isSelected = selectedModels.some(
                            (m) =>
                              m.provider === provider.id &&
                              m.model === model.id,
                          );
                          return (
                            <button
                              key={model.id}
                              onClick={() =>
                                toggleModel(provider.id, model.id, model.name)
                              }
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-[var(--radius-md)] border text-sm transition-all ${
                                isSelected
                                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                                  : 'border-[var(--color-border-primary)] hover:border-[var(--color-border-secondary)]'
                              }`}
                            >
                              <span
                                className={
                                  isSelected
                                    ? 'text-[var(--color-accent)] font-medium'
                                    : 'text-[var(--color-text-primary)]'
                                }
                              >
                                {model.name}
                              </span>
                              {isSelected && (
                                <Check
                                  size={16}
                                  className="text-[var(--color-accent)]"
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between">
                  <Button variant="ghost" onClick={back}>
                    <ChevronLeft size={16} /> Back
                  </Button>
                  <Button
                    onClick={next}
                    disabled={selectedModels.length === 0}
                  >
                    Continue <ChevronRight size={16} />
                  </Button>
                </div>
              </div>
            )}

            {currentStep === 'keys' && (
              <div>
                <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">
                  Enter API Keys
                </h2>
                <p className="text-sm text-[var(--color-text-secondary)] mb-6">
                  Provide API keys for your selected providers. Keys are stored
                  securely in macOS Keychain.
                </p>

                <div className="space-y-4 mb-6 max-h-[350px] overflow-y-auto">
                  {[...new Set([...selectedProviders, masterModel.provider])].map(
                    (providerId) => {
                      const provider = PROVIDERS.find((p) => p.id === providerId)!;
                      return (
                        <div key={providerId}>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-sm font-medium text-[var(--color-text-primary)]">
                              {provider.name}
                            </label>
                            <div className="relative">
                              <button
                                onClick={() => setOpenInfo(openInfo === providerId ? null : providerId)}
                                className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-bg-hover)] transition-colors"
                                title="How to get API key"
                              >
                                <Info size={14} />
                              </button>
                              <ApiKeyInfoPopover
                                provider={provider}
                                isOpen={openInfo === providerId}
                                onClose={() => setOpenInfo(null)}
                              />
                            </div>
                          </div>
                          <input
                            type="password"
                            value={apiKeys[providerId] || ''}
                            onChange={(e) =>
                              setApiKeys((prev) => ({
                                ...prev,
                                [providerId]: e.target.value,
                              }))
                            }
                            placeholder={`Enter ${provider.name} API key`}
                            className="w-full px-3 py-2 text-sm bg-[var(--color-bg-input)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)] font-mono"
                          />
                        </div>
                      );
                    },
                  )}
                </div>

                <div className="flex justify-between">
                  <Button variant="ghost" onClick={back}>
                    <ChevronLeft size={16} /> Back
                  </Button>
                  <Button onClick={next}>
                    Continue <ChevronRight size={16} />
                  </Button>
                </div>
              </div>
            )}

            {currentStep === 'master' && (
              <div>
                <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">
                  Choose Master Model
                </h2>
                <p className="text-sm text-[var(--color-text-secondary)] mb-6">
                  The master model synthesizes all opinions and delivers the
                  final verdict.
                </p>

                <div className="space-y-2 mb-6 max-h-[350px] overflow-y-auto">
                  {PROVIDERS.flatMap((provider) =>
                    provider.models.map((model) => {
                      const isSelected =
                        masterModel.provider === provider.id &&
                        masterModel.model === model.id;
                      return (
                        <button
                          key={`${provider.id}:${model.id}`}
                          onClick={() =>
                            setMasterModel({
                              provider: provider.id,
                              model: model.id,
                            })
                          }
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-[var(--radius-md)] border text-sm transition-all ${
                            isSelected
                              ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                              : 'border-[var(--color-border-primary)] hover:border-[var(--color-border-secondary)]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{
                                backgroundColor: getProviderColor(provider.id),
                              }}
                            />
                            <span
                              className={
                                isSelected
                                  ? 'text-[var(--color-accent)] font-medium'
                                  : 'text-[var(--color-text-primary)]'
                              }
                            >
                              {model.name}
                            </span>
                            <span className="text-xs text-[var(--color-text-tertiary)]">
                              ({provider.name})
                            </span>
                          </div>
                          {isSelected && (
                            <Check
                              size={16}
                              className="text-[var(--color-accent)]"
                            />
                          )}
                        </button>
                      );
                    }),
                  )}
                </div>

                <div className="flex justify-between">
                  <Button variant="ghost" onClick={back}>
                    <ChevronLeft size={16} /> Back
                  </Button>
                  <Button onClick={() => { handleComplete(); next(); }}>
                    Complete Setup <ChevronRight size={16} />
                  </Button>
                </div>
              </div>
            )}

            {currentStep === 'complete' && (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mx-auto mb-6">
                  <Check size={28} className="text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-3">
                  You're All Set!
                </h2>
                <p className="text-[var(--color-text-secondary)] mb-8">
                  Your council is ready. Ask any question and get insights from
                  {selectedModels.length} AI models.
                </p>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  You can change these settings anytime from the gear icon.
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
