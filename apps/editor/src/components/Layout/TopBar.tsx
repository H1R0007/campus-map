import React, { useEffect, useRef, useState } from 'react';
import { useEditorStore, useUnsavedChanges } from '../../stores/editorStore';
import type { Workspace } from '../../stores/editor/panelSlice';
import { useHistoryStore } from '../../stores/historyStore';
import { importDatasetFromZip } from '../../utils/importZip';
import { validateDataset } from '../../utils/validateData';
import { structureChecks } from '../../utils/structureChecks';
import { useValidationReport } from '../../hooks/useValidationReport';
import { useStructureChecks } from '../../hooks/useStructureChecks';
import { ConfirmDialog } from '../UI/ConfirmDialog';
import { Icon } from '../UI/Icon';
import { SandboxButton } from '../UI/Sandbox';
import { SettingsMenu } from '../UI/SettingsMenu';
import { SearchPanel } from '../UI/SearchPanel';
import { SPACE } from '../../config/space';

const WORKSPACES: { id: Workspace; label: string; title: string }[] = [
  { id: 'plans', label: 'Планы и корпуса', title: 'Территория, корпуса, этажи, планы, размещение и масштаб' },
  { id: 'markup', label: 'Разметка', title: 'Точки, связи и переходы' },
  { id: 'check', label: 'Проверка', title: 'Замечания и проверка маршрута' },
];

/**
 * Шапка редактора: отмена, режимы работы, строка поиска, сохранение, а у
 * правого края — справка и настройки (записи 60, 74).
 *
 * Режимы — как рабочие пространства профессиональных редакторов: у каждого
 * занятия свои панели. Сохранение — одна кнопка, архив — в её меню: в шапке
 * не три кнопки файлов, а одна.
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
  const setHelpOpen = useEditorStore((s) => s.setHelpOpen);

  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  // Кнопка называет действие, которое отменит: список «Последних действий»
  // поверх плана для этого больше не нужен.
  const undoDescription = useHistoryStore((s) => s.getUndoDescription());
  const redoDescription = useHistoryStore((s) => s.getRedoDescription());

  const [isImporting, setIsImporting] = useState(false);
  const [pendingSave, setPendingSave] = useState<'disk' | 'archive' | null>(null);
  const [validation, setValidation] = useState<{ errors: string[]; warnings: string[]; navigator: string[] }>({
    errors: [],
    warnings: [],
    navigator: [],
  });

  /**
   * Сохраняет разметку: в каталог данных или архивом.
   *
   * Перед сохранением данные проверяются, и если есть ошибки или
   * предупреждения — редактор показывает их и спрашивает, сохранять ли всё
   * равно. Молча записать битые данные хуже, чем задержать сохранение.
   */
  const handleSave = async (target: 'disk' | 'archive', force = false) => {
    useEditorStore.getState().closeSession();
    const st = useEditorStore.getState();
    const result = validateDataset({
      nodes: st.nodes,
      transitions: st.transitions,
      buildingMetas: st.buildingMetas,
    });
    // Что после сохранения увидят люди в навигаторе (запись 51).
    const navigator = structureChecks(st)
      .filter((issue) => issue.navigator)
      .map((issue) => issue.text);
    setValidation({ ...result, navigator });

    if (!force && (result.errors.length > 0 || result.warnings.length > 0 || navigator.length > 0)) {
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
      alert('Ошибка импорта: ' + (cause instanceof Error ? cause.message : 'не удалось прочитать архив'));
    } finally {
      setIsImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

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
            <Icon name="undo" size={18} />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!redoDescription}
            className="editor-icon-button"
            title={redoDescription ? `Повторить: ${redoDescription} (Ctrl+Y)` : 'Повторять нечего'}
            aria-label={redoDescription ? `Повторить: ${redoDescription}` : 'Повторить'}
          >
            <Icon name="redo" size={18} />
          </button>
        </div>

        <WorkspaceSwitch />

        <SearchPanel />

        <div className="editor-topbar__spacer" />

        <SandboxButton />
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
        <SaveMenu
          diskSaveAvailable={diskSaveAvailable}
          saving={saving}
          importing={isImporting}
          unsaved={unsaved}
          saveTitle={SPACE === 'sandbox' ? 'Сохранить в учебную копию (Ctrl+S)' : `Сохранить в ${diskDataDir ?? 'data/'} (Ctrl+S)`}
          onSave={() => void handleSave('disk')}
          onArchive={() => void handleSave('archive')}
          onOpenArchive={() => fileRef.current?.click()}
        />

        {/* Справка и настройки — у правого края, как принято: это не работа
            с картой, а сам редактор (запись 74). */}
        <div className="editor-topbar__group editor-topbar__end" role="group" aria-label="Справка и настройки">
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="editor-icon-button"
            aria-label="Справка: мышь и клавиши"
            title="Справка: мышь и клавиши (F1)"
          >
            <Icon name="help" size={18} />
          </button>
          <SettingsMenu />
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
          {validation.warnings.length > 0 && <ReportList kind="warn" title="Предупреждения" items={validation.warnings} />}
          {validation.navigator.length > 0 && <ReportList kind="warn" title="Что заметят в навигаторе" items={validation.navigator} />}
        </div>
      </ConfirmDialog>
    </>
  );
};

/** Режимы работы: «Планы и корпуса», «Разметка», «Проверка» (запись 60). */
const WorkspaceSwitch: React.FC = () => {
  const workspace = useEditorStore((s) => s.workspace);
  const setWorkspace = useEditorStore((s) => s.setWorkspace);
  const openCheck = useEditorStore((s) => s.openCheck);
  const report = useValidationReport();
  const structure = useStructureChecks();
  const errors = report.errors.length;
  const problems = errors + report.warnings.length + structure.length;

  return (
    <div className="editor-modes" role="group" aria-label="Режим работы">
      {WORKSPACES.map((item) => (
        <button
          key={item.id}
          type="button"
          className="editor-modes__item"
          aria-pressed={workspace === item.id}
          title={item.id === 'check' && problems > 0 ? `${item.title}: ошибок ${errors}, предупреждений ${problems - errors}` : item.title}
          onClick={() => (item.id === 'check' ? openCheck() : setWorkspace(item.id))}
        >
          {item.label}
          {item.id === 'check' && problems > 0 && (
            <span className={`editor-badge ${errors > 0 ? 'editor-badge--error' : 'editor-badge--warn'}`}>{problems}</span>
          )}
        </button>
      ))}
    </div>
  );
};

/**
 * «Сохранить» и меню рядом: архив скачать и открыть. Где сохранения на диск
 * нет (развёрнутый редактор), главная кнопка — «Скачать архив».
 */
const SaveMenu: React.FC<{
  diskSaveAvailable: boolean;
  saving: boolean;
  importing: boolean;
  unsaved: boolean;
  saveTitle: string;
  onSave: () => void;
  onArchive: () => void;
  onOpenArchive: () => void;
}> = ({ diskSaveAvailable, saving, importing, unsaved, saveTitle, onSave, onArchive, onOpenArchive }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const pick = (run: () => void) => () => {
    setOpen(false);
    run();
  };

  return (
    <div className="editor-menu editor-split" ref={rootRef}>
      {diskSaveAvailable ? (
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !unsaved}
          className="editor-button editor-button--primary editor-split__main"
          title={saveTitle}
        >
          <Icon name={saving ? 'refresh' : 'checkCircle'} className={saving ? 'animate-spin' : undefined} />
          Сохранить
        </button>
      ) : (
        <button type="button" onClick={onArchive} disabled={saving} className="editor-button editor-button--primary editor-split__main" title="Скачать архив с данными">
          <Icon name={saving ? 'refresh' : 'download'} className={saving ? 'animate-spin' : undefined} />
          Скачать архив
        </button>
      )}
      <button
        ref={toggleRef}
        type="button"
        className="editor-button editor-button--primary editor-split__toggle"
        aria-label="Ещё: архив"
        title="Архив: скачать или открыть"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="editor-menu__popover" role="group" aria-label="Архив">
          {diskSaveAvailable && (
            <button type="button" className="editor-menu__item" disabled={saving} onClick={pick(onArchive)}>
              <Icon name="download" />
              Скачать архив
            </button>
          )}
          <button type="button" className="editor-menu__item" disabled={importing} onClick={pick(onOpenArchive)}>
            <Icon name="upload" />
            Открыть архив…
          </button>
        </div>
      )}
    </div>
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
      {title} · {items.length}
    </div>
    <ul className="mt-1 text-sm space-y-1 max-h-32 overflow-y-auto" style={{ color: 'var(--editor-text-muted)' }}>
      {items.slice(0, 10).map((item, i) => (
        <li key={i}>• {item}</li>
      ))}
      {items.length > 10 && <li>… и ещё {items.length - 10}</li>}
    </ul>
  </div>
);
