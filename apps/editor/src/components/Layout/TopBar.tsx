import React, { useEffect, useRef, useState } from 'react';
import { useEditorStore, useUnsavedChanges } from '../../stores/editorStore';
import { useHistoryStore } from '../../stores/historyStore';
import { importDatasetFromZip } from '../../utils/importZip';
import { validateDataset } from '../../utils/validateData';
import { useValidationReport } from '../../hooks/useValidationReport';
import { ConfirmDialog } from '../UI/ConfirmDialog';
import { Icon } from '../UI/Icon';

/**
 * Шапка редактора: отмена, проверка, поиск и файлы.
 *
 * Инструменты ушли в колонку слева от карты, действия с выбранным — в строку
 * над картой; здесь остаётся то, что относится ко всей разметке сразу.
 */
export const TopBar: React.FC = () => {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const saveToDisk = useEditorStore((s) => s.saveToDisk);
  const exportArchive = useEditorStore((s) => s.exportArchive);
  const diskSaveAvailable = useEditorStore((s) => s.diskSaveAvailable);
  const diskDataDir = useEditorStore((s) => s.diskDataDir);
  const saving = useEditorStore((s) => s.saving);
  const saveRequest = useEditorStore((s) => s.saveRequest);
  const unsaved = useUnsavedChanges();
  const loadData = useEditorStore((s) => s.loadData);
  const setSearchOpen = useEditorStore((s) => s.setSearchOpen);
  const setInspectorTab = useEditorStore((s) => s.setInspectorTab);
  const setHelpOpen = useEditorStore((s) => s.setHelpOpen);

  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  // Кнопка называет действие, которое отменит: список «Последних действий»
  // поверх плана для этого больше не нужен.
  const undoDescription = useHistoryStore((s) => s.getUndoDescription());
  const redoDescription = useHistoryStore((s) => s.getRedoDescription());

  const report = useValidationReport();
  const errorCount = report.errors.length;
  const warningCount = report.warnings.length;

  const [isImporting, setIsImporting] = useState(false);
  const [pendingSave, setPendingSave] = useState<'disk' | 'archive' | null>(null);
  const [validation, setValidation] = useState<{ errors: string[]; warnings: string[] }>({
    errors: [],
    warnings: [],
  });

  /**
   * Сохраняет разметку: в каталог данных или архивом.
   *
   * Перед сохранением данные проверяются, и если есть ошибки или
   * предупреждения — редактор показывает их и спрашивает, сохранять ли всё
   * равно. Молча записать битые данные хуже, чем задержать сохранение.
   */
  const handleSave = async (target: 'disk' | 'archive', force = false) => {
    const st = useEditorStore.getState();
    const result = validateDataset({
      nodes: st.nodes,
      transitions: st.transitions,
      buildingMetas: st.buildingMetas,
    });
    setValidation(result);

    if (!force && (result.errors.length > 0 || result.warnings.length > 0)) {
      setPendingSave(target);
      return;
    }

    setPendingSave(null);
    if (target === 'disk') await saveToDisk();
    else await exportArchive();
  };

  // Ctrl+S: клавиша просит сохранить, проверка данных — здесь же.
  useEffect(() => {
    if (saveRequest === 0) return;
    void handleSave(diskSaveAvailable ? 'disk' : 'archive');
    // Реагируем только на новую просьбу, а не на каждое изменение шапки.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveRequest]);

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

  const checkLabel =
    errorCount + warningCount === 0
      ? 'Проверка: замечаний нет'
      : `Проверка: ошибок ${errorCount}, предупреждений ${warningCount}`;

  return (
    <>
      <header className="editor-topbar">
        <span className="editor-topbar__title">Редактор кампуса</span>

        <div className="editor-topbar__group" role="group" aria-label="Отмена и повтор">
          <button
            type="button"
            onClick={undo}
            disabled={!undoDescription}
            className="editor-icon-button"
            title={undoDescription ? `Отменить: ${undoDescription} (Ctrl+Z)` : 'Отменять нечего'}
            aria-label={undoDescription ? `Отменить: ${undoDescription}` : 'Отменить'}
          >
            <Icon name="undo" size={20} />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!redoDescription}
            className="editor-icon-button"
            title={redoDescription ? `Повторить: ${redoDescription} (Ctrl+Y)` : 'Повторять нечего'}
            aria-label={redoDescription ? `Повторить: ${redoDescription}` : 'Повторить'}
          >
            <Icon name="redo" size={20} />
          </button>
        </div>

        <div className="editor-topbar__spacer" />

        <button
          type="button"
          onClick={() => setInspectorTab('problems')}
          className="editor-button editor-button--ghost"
          title={checkLabel}
          aria-label={checkLabel}
        >
          <Icon name={errorCount > 0 ? 'errorCircle' : warningCount > 0 ? 'warning' : 'checkCircle'} />
          Проверка
          {errorCount + warningCount > 0 && (
            <span className={`editor-badge ${errorCount > 0 ? 'editor-badge--error' : 'editor-badge--warn'}`}>
              {errorCount > 0 ? errorCount : warningCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="editor-button editor-button--ghost"
          title="Поиск (Ctrl+F)"
        >
          <Icon name="search" />
          Поиск
        </button>

        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="editor-icon-button"
          aria-label="Справка: мышь и клавиши"
          title="Справка: мышь и клавиши (F1)"
        >
          <Icon name="help" size={20} />
        </button>

        <div className="editor-topbar__group" role="group" aria-label="Файлы">
          <input
            ref={fileRef}
            type="file"
            accept=".zip"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportFile(f);
            }}
          />

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={isImporting}
            className="editor-button editor-button--ghost"
            title="Открыть архив с данными вместо текущих"
          >
            <Icon name={isImporting ? 'refresh' : 'upload'} className={isImporting ? 'animate-spin' : undefined} />
            Открыть архив
          </button>

          <button
            type="button"
            onClick={() => void handleSave('archive')}
            disabled={saving}
            className={`editor-button ${diskSaveAvailable ? 'editor-button--ghost' : 'editor-button--primary'}`}
            title="Скачать архив с данными"
          >
            <Icon name={saving ? 'refresh' : 'download'} className={saving ? 'animate-spin' : undefined} />
            Скачать архив
          </button>

          {diskSaveAvailable && (
            <button
              type="button"
              onClick={() => void handleSave('disk')}
              disabled={saving || !unsaved}
              className="editor-button editor-button--primary"
              title={`Сохранить в ${diskDataDir ?? 'data/'} (Ctrl+S)`}
            >
              <Icon name={saving ? 'refresh' : 'checkCircle'} className={saving ? 'animate-spin' : undefined} />
              Сохранить
            </button>
          )}
        </div>
      </header>

      <ConfirmDialog
        open={pendingSave !== null}
        onClose={() => setPendingSave(null)}
        title="Проверка перед сохранением"
        footer={
          <>
            <button type="button" onClick={() => setPendingSave(null)} className="editor-button editor-button--ghost">
              Отмена
            </button>
            <button
              type="button"
              onClick={() => pendingSave && void handleSave(pendingSave, true)}
              className="editor-button editor-button--primary"
            >
              {pendingSave === 'disk' ? 'Сохранить всё равно' : 'Скачать всё равно'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {validation.errors.length > 0 && <ReportList kind="error" title="Ошибки" items={validation.errors} />}
          {validation.warnings.length > 0 && (
            <ReportList kind="warn" title="Предупреждения" items={validation.warnings} />
          )}
        </div>
      </ConfirmDialog>
    </>
  );
};

/** Первые десять замечаний проверки и число остальных. */
const ReportList: React.FC<{ kind: 'error' | 'warn'; title: string; items: string[] }> = ({ kind, title, items }) => (
  <div>
    <div
      className="text-sm font-medium inline-flex items-center gap-2"
      style={{ color: kind === 'error' ? 'var(--editor-danger)' : 'var(--editor-warn)' }}
    >
      <Icon name={kind === 'error' ? 'errorCircle' : 'warning'} />
      {title} ({items.length})
    </div>
    <ul className="mt-1 text-sm space-y-1 max-h-32 overflow-y-auto" style={{ color: 'var(--editor-text-muted)' }}>
      {items.slice(0, 10).map((item, i) => (
        <li key={i}>• {item}</li>
      ))}
      {items.length > 10 && <li>… и ещё {items.length - 10}</li>}
    </ul>
  </div>
);
