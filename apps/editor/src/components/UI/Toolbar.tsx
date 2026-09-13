import React, { useRef, useState } from 'react';
import { TRANSITION_TYPES, transitionTypeLabel } from '@campus-map/core';
import { TRANSITION_COLORS, TransitionGlyph } from '@campus-map/mapkit';
import { useEditorStore, EditorTool } from '../../stores/editorStore';
import { useHistoryStore } from '../../stores/historyStore';
import { importDatasetFromZip } from '../../utils/importZip';
import { validateDataset } from '../../utils/validateData';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';
import type { IconName } from './Icon';

/** Инструменты. Значок `null` — значок выбранного типа перехода. */
const tools: { id: EditorTool; icon: IconName | null; label: string; shortcut: string }[] = [
  { id: 'select', label: 'Выбор', shortcut: 'V', icon: 'select' },
  { id: 'node', label: 'Узел', shortcut: 'N', icon: 'plus' },
  { id: 'edge', label: 'Ребро', shortcut: 'E', icon: 'link' },
  { id: 'transition', label: 'Переход', shortcut: 'T', icon: null },
  { id: 'line', label: 'Линия', shortcut: 'L', icon: 'ruler' },
  { id: 'delete', label: 'Удалить', shortcut: 'D', icon: 'trash' },
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
      // Импорт возвращает тот же результат, что и загрузка по HTTP:
      // датасет уже нормализован ядром, дополнительно преобразовывать нечего.
      const { dataset, warnings } = await importDatasetFromZip(file);
      loadData(dataset, warnings);
      useEditorStore.getState().setCurrentBuilding(null);
    } catch (cause) {
      alert(
        'Ошибка импорта: ' +
          (cause instanceof Error ? cause.message : 'не удалось прочитать архив')
      );
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
              <span className="mr-1 inline-flex align-middle">
                {t.icon === null ? <TransitionGlyph type={transitionType} size={16} /> : <Icon name={t.icon} />}
              </span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}

          {/* Transition types */}
          {activeTool === 'transition' && (
            <>
              <div className="mx-2 w-px h-6" style={{ backgroundColor: 'var(--editor-border)' }} />
              {TRANSITION_TYPES.map((tp) => {
                const color = TRANSITION_COLORS[tp];
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
                    <TransitionGlyph type={tp} size={14} />
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
              <Icon name="trash" />
            </button>

            <button
              onClick={duplicateSelected}
              className="p-1.5 rounded hover:bg-white/10"
              title="Дублировать (Ctrl+D)"
              style={{ color: 'white' }}
            >
              <Icon name="duplicate" />
            </button>

            <button
              onClick={copySelected}
              className="p-1.5 rounded hover:bg-white/10"
              title="Копировать (Ctrl+C)"
              style={{ color: 'white' }}
            >
              <Icon name="copy" />
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
                  <Icon name="link" />
                </button>
                <button
                  onClick={() => setSelectedPortal(true)}
                  className="p-1.5 rounded hover:bg-white/10"
                  title="Сделать порталами"
                  style={{ color: '#f59e0b' }}
                >
                  <Icon name="star" />
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
            <Icon name="search" />
          </button>

          {clipboard && (
            <button
              onClick={() => paste()}
              className="px-3 py-2 rounded-lg text-sm"
              style={{ backgroundColor: 'var(--editor-accent)', color: 'white' }}
              title="Вставить (Ctrl+V)"
            >
              <span className="inline-flex items-center gap-2"><Icon name="paste" />Вставить</span>
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
              <Icon name="undo" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="px-2 py-2 rounded-lg disabled:opacity-30"
              title="Повтор (Ctrl+Y)"
              style={{ backgroundColor: 'var(--editor-accent)', color: 'white' }}
            >
              <Icon name="redo" />
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
            <span className="inline-flex items-center gap-2">
              <Icon name={isImporting ? 'refresh' : 'download'} className={isImporting ? 'animate-spin' : undefined} />
              Импорт
            </span>
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
            <span className="inline-flex items-center gap-2">
              <Icon name={isExporting ? 'refresh' : 'upload'} className={isExporting ? 'animate-spin' : undefined} />
              Экспорт
            </span>
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
                <span className="inline-flex items-center gap-2"><Icon name="errorCircle" />Ошибки ({validation.errors.length})</span>
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
                <span className="inline-flex items-center gap-2"><Icon name="warning" />Предупреждения ({validation.warnings.length})</span>
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
