import { useState } from 'react';
import { GripVertical, Plus, Trash2, Crown } from 'lucide-react';
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
import { PROVIDERS, getProviderColor } from '../../types';
import type { ModelConfig, Provider, MasterModelConfig } from '../../types';

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

    </div>
  );
}
