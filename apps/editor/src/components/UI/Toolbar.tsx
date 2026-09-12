import React, { useRef, useState } from 'react';
import {
  TRANSITION_TYPES,
  transitionTypeLabel,
  transitionTypeIcon,
  transitionTypeColor,
} from '@campus-map/core';
import { useEditorStore, EditorTool } from '../../stores/editorStore';
import { useHistoryStore } from '../../stores/historyStore';
import { importDatasetFromZip } from '../../utils/importZip';
import { validateDataset } from '../../utils/validateData';
import { ConfirmDialog } from './ConfirmDialog';

const tools: { id: EditorTool; icon: string; label: string; shortcut: string }[] = [
  { id: 'select', label: 'Выбор', shortcut: 'V', icon: '👆' },
  { id: 'node', label: 'Узел', shortcut: 'N', icon: '➕' },
  { id: 'edge', label: 'Ребро', shortcut: 'E', icon: '🔗' },
  { id: 'transition', label: 'Переход', shortcut: 'T', icon: '🚪' },
  { id: 'line', label: 'Линия', shortcut: 'L', icon: '📏' },
  { id: 'delete', label: 'Удалить', shortcut: 'D', icon: '🗑️' },
];

export const Toolbar: React.FC = () => {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const activeTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const transitionType = useEditorStore((s) => s.transitionType);
  const setTransitionType = useEditorStore((s) => s.setTransitionType);

  const exportToZip = useEditorStore((s) => s.exportToZip);
  const loadData = useEditorStore((s) => s.loadData);
  const setSearchOpen = useEditorStore((s) => s.setSearchOpen);

  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected);
  const setSelectedPortal = useEditorStore((s) => s.setSelectedPortal);
  const connectSelectedChain = useEditorStore((s) => s.connectSelectedChain);
  const copySelected = useEditorStore((s) => s.copySelected);
  const paste = useEditorStore((s) => s.paste);
  const clipboard = useEditorStore((s) => s.clipboard);

  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useHistoryStore((s) => s.canUndo());
  const canRedo = useHistoryStore((s) => s.canRedo());

  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [validation, setValidation] = useState<{ errors: string[]; warnings: string[] }>({
    errors: [],
    warnings: [],
  });

  const hasSelection = selectedNodeIds.size > 0;
  const multiSelection = selectedNodeIds.size > 1;

  const handleExport = async (force = false) => {
    const st = useEditorStore.getState();
    const result = validateDataset({
      nodes: st.nodes,
      transitions: st.transitions,
      buildingMetas: st.buildingMetas,
    });
    setValidation(result);

    if (!force && (result.errors.length > 0 || result.warnings.length > 0)) {
      setValidationOpen(true);
      return;
    }

    setValidationOpen(false);
    setIsExporting(true);
    try {
      await exportToZip();
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFile = async (file: File) => {
    setIsImporting(true);
    try {
      const data = await importDatasetFromZip(file);
      loadData({
        nodes: data.nodes,
        transitions: data.transitions,
        buildingMetas: data.buildingMetas,
        aliases: data.aliases,
      });
      useEditorStore.getState().setCurrentBuilding(null);
    } catch (e) {
      alert('Ошибка импорта: ' + (e instanceof Error ? e.message : 'Unknown'));
    } finally {
      setIsImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <div
        className="h-14 flex items-center justify-between px-4 gap-4"
        style={{ backgroundColor: 'var(--editor-panel)', borderBottom: '1px solid var(--editor-border)' }}
      >
        {/* Left: Tools */}
        <div className="flex items-center gap-1">
          {tools.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTool(t.id)}
              className="px-3 py-2 rounded-lg transition-colors text-sm"
              title={`${t.label} (${t.shortcut})`}
              style={{
                backgroundColor: activeTool === t.id ? 'var(--editor-highlight)' : 'transparent',
                color: activeTool === t.id ? 'white' : 'var(--editor-text-muted)',
              }}
            >
              <span className="mr-1">{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}

          {/* Transition types */}
          {activeTool === 'transition' && (
            <>
              <div className="mx-2 w-px h-6" style={{ backgroundColor: 'var(--editor-border)' }} />
              {TRANSITION_TYPES.map((tp) => {
                const color = transitionTypeColor(tp);
                return (
                  <button
                    key={tp}
                    onClick={() => setTransitionType(tp)}
                    className="px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1"
                    style={{
                      backgroundColor: transitionType === tp ? color : 'transparent',
                      color: transitionType === tp ? 'white' : 'var(--editor-text-muted)',
                      border: `1px solid ${color}`,
                    }}
                  >
                    <span>{transitionTypeIcon(tp)}</span>
                    <span>{transitionTypeLabel(tp)}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* Center: Selection actions */}
        {hasSelection && (
          <div
            className="flex items-center gap-1 px-3 py-1 rounded-lg"
            style={{ backgroundColor: 'var(--editor-bg)' }}
          >
            <span className="text-xs mr-2" style={{ color: 'var(--editor-text-muted)' }}>
              {selectedNodeIds.size} выбрано:
            </span>

            <button
              onClick={deleteSelected}
              className="p-1.5 rounded hover:bg-red-500/20"
              title="Удалить (Delete)"
              style={{ color: '#fca5a5' }}
            >
              🗑️
            </button>

            <button
              onClick={duplicateSelected}
              className="p-1.5 rounded hover:bg-white/10"
              title="Дублировать (Ctrl+D)"
              style={{ color: 'white' }}
            >
              📋
            </button>

            <button
              onClick={copySelected}
              className="p-1.5 rounded hover:bg-white/10"
              title="Копировать (Ctrl+C)"
              style={{ color: 'white' }}
            >
              📄
            </button>

            {multiSelection && (
              <>
                <div className="mx-1 w-px h-4" style={{ backgroundColor: 'var(--editor-border)' }} />
                <button
                  onClick={connectSelectedChain}
                  className="p-1.5 rounded hover:bg-white/10"
                  title="Соединить цепочкой"
                  style={{ color: 'white' }}
                >
                  🔗
                </button>
                <button
                  onClick={() => setSelectedPortal(true)}
                  className="p-1.5 rounded hover:bg-white/10"
                  title="Сделать порталами"
                  style={{ color: '#f59e0b' }}
                >
                  ⭐
                </button>
              </>
            )}
          </div>
        )}

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSearchOpen(true)}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ backgroundColor: 'var(--editor-accent)', color: 'white' }}
            title="Поиск (Ctrl+F)"
          >
            🔍
          </button>

          {clipboard && (
            <button
              onClick={() => paste()}
              className="px-3 py-2 rounded-lg text-sm"
              style={{ backgroundColor: 'var(--editor-accent)', color: 'white' }}
              title="Вставить (Ctrl+V)"
            >
              📋 Вставить
            </button>
          )}

          <div className="flex gap-1">
            <button
              onClick={undo}
              disabled={!canUndo}
              className="px-2 py-2 rounded-lg disabled:opacity-30"
              title="Отмена (Ctrl+Z)"
              style={{ backgroundColor: 'var(--editor-accent)', color: 'white' }}
            >
              ↩
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="px-2 py-2 rounded-lg disabled:opacity-30"
              title="Повтор (Ctrl+Y)"
              style={{ backgroundColor: 'var(--editor-accent)', color: 'white' }}
            >
              ↪
            </button>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportFile(f);
            }}
          />

          <button
            onClick={() => fileRef.current?.click()}
            disabled={isImporting}
            className="px-3 py-2 rounded-lg text-sm"
            style={{
              backgroundColor: 'var(--editor-accent)',
              color: 'white',
              opacity: isImporting ? 0.6 : 1,
            }}
          >
            {isImporting ? '⏳' : '📥'} Импорт
          </button>

          <button
            onClick={() => handleExport(false)}
            disabled={isExporting}
            className="px-3 py-2 rounded-lg text-sm font-medium"
            style={{
              backgroundColor: 'var(--editor-highlight)',
              color: 'white',
              opacity: isExporting ? 0.6 : 1,
            }}
          >
            {isExporting ? '⏳' : '📤'} Экспорт
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={validationOpen}
        onClose={() => setValidationOpen(false)}
        title="Проверка перед экспортом"
        footer={
          <>
            <button
              onClick={() => setValidationOpen(false)}
              className="px-4 py-2 rounded-lg text-sm"
              style={{ color: 'var(--editor-text-muted)' }}
            >
              Отмена
            </button>
            <button
              onClick={() => handleExport(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ backgroundColor: 'var(--editor-highlight)', color: 'white' }}
            >
              Экспортировать
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {validation.errors.length > 0 && (
            <div>
              <div className="text-sm font-medium" style={{ color: '#fca5a5' }}>
                ❌ Ошибки ({validation.errors.length})
              </div>
              <ul className="mt-1 text-xs space-y-1 max-h-32 overflow-y-auto" style={{ color: 'var(--editor-text-muted)' }}>
                {validation.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
                {validation.errors.length > 10 && <li>... и ещё {validation.errors.length - 10}</li>}
              </ul>
            </div>
          )}

          {validation.warnings.length > 0 && (
            <div>
              <div className="text-sm font-medium" style={{ color: '#fbbf24' }}>
                ⚠️ Предупреждения ({validation.warnings.length})
              </div>
              <ul className="mt-1 text-xs space-y-1 max-h-32 overflow-y-auto" style={{ color: 'var(--editor-text-muted)' }}>
                {validation.warnings.slice(0, 10).map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
                {validation.warnings.length > 10 && (
                  <li>... и ещё {validation.warnings.length - 10}</li>
                )}
              </ul>
            </div>
          )}
        </div>
      </ConfirmDialog>
    </>
  );
};