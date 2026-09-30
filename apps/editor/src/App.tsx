import React, { useEffect, useState } from 'react';
import { createHttpDatasetSource, loadDataset } from '@campus-map/core';
import { TopBar } from './components/Layout/TopBar';
import { StructurePanel } from './components/Layout/StructurePanel';
import { ToolRail } from './components/Layout/ToolRail';
import { ToolOptions } from './components/Layout/ToolOptions';
import { MapWindows } from './components/Layout/MapWindows';
import { Inspector } from './components/Layout/Inspector';
import { StatusBar } from './components/UI/StatusBar';
import { SearchPanel } from './components/UI/SearchPanel';
import { ImportDialog } from './components/UI/ImportDialog';
import { ImportDropZone } from './components/UI/ImportDropZone';
import { ContextMenu } from './components/UI/ContextMenu';
import { DraftPrompt } from './components/UI/DraftPrompt';
import { HelpDialog } from './components/UI/HelpDialog';
import { KindsDialog } from './components/UI/KindsDialog';
import { SandboxBanner } from './components/UI/Sandbox';
import { useEditorStore, useUnsavedChanges } from './stores/editorStore';
import { DATA_BASE_URL } from './config/dataBase';
import { SPACE } from './config/space';
import { fetchDiskManifest, fetchSandboxState, resetSandbox } from './utils/diskStore';
import { loadedPlanFiles, planFilesByHash } from './utils/planFiles';
import { isLeavingOnPurpose } from './utils/leavePage';
import { watchSystemTheme } from './utils/theme';

/**
 * Экран ошибки с возможностью перезагрузки.
 *
 * Редактор — рабочий инструмент, и падение одного компонента не должно
 * терять несохранённую разметку без объяснения причины.
 */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Ошибка редактора:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="editor-splash">
          <div className="editor-splash__box">
            <h1 className="editor-splash__title">Произошла ошибка</h1>
            <p className="editor-splash__text">{this.state.error?.message || 'Неизвестная ошибка'}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="editor-button editor-button--primary mt-4"
            >
              Перезагрузить
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Предупреждение браузера при закрытии вкладки с несохранёнными правками.
 *
 * Разметка сотен узлов — часы работы, а закрытая вкладка стирала их без
 * вопроса. Сам текст выбирает браузер, страница только говорит, что уходить
 * рано; несохранённое при этом остаётся в черновике.
 */
function useUnloadGuard(): void {
  const unsaved = useUnsavedChanges();

  useEffect(() => {
    if (!unsaved) return;

    const handler = (event: BeforeUnloadEvent) => {
      // В учебную копию и обратно редактор уходит сам, записав черновик.
      if (isLeavingOnPurpose()) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [unsaved]);
}

const App: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const isLoading = useEditorStore((s) => s.isLoading);
  const loadData = useEditorStore((s) => s.loadData);
  const initStorage = useEditorStore((s) => s.initStorage);
  const syncSystemTheme = useEditorStore((s) => s.syncSystemTheme);
  const workspace = useEditorStore((s) => s.workspace);
  useUnloadGuard();
  // «Как в системе»: тема системы сменилась — сменилась и тема редактора.
  useEffect(() => watchSystemTheme(syncSystemTheme), [syncSystemTheme]);

  useEffect(() => {
    // StrictMode монтирует эффект дважды; без флага отмены второй запуск
    // перезаписывал состояние уже после завершения первого.
    let cancelled = false;

    const load = async () => {
      try {
        // Учебную копию открыли адресом, а самой копии нет (её убрали
        // вручную) — делаем её, иначе загружать нечего.
        if (SPACE === 'sandbox') {
          const sandbox = await fetchSandboxState();
          if (sandbox && !sandbox.exists) {
            const failure = await resetSandbox();
            if (failure) throw new Error(`Учебная копия не создана: ${failure}`);
          }
        }

        // Загрузка и нормализация датасета — задача ядра. Собственный обход
        // файлов здесь дублировал `loadDataset`, отличался от него поведением
        // на ошибках и глушил их пустыми `catch {}`: отсутствующий этаж или
        // битый JSON проходили незамеченными, а `building` и `floor` узлам
        // приходилось проставлять вручную, хотя загрузчик берёт их из пути.
        //
        // Манифест каталога данных — вместе с данными: по нему видно, каких
        // планов на диске нет. Без него карта сначала запрашивала план по
        // пути из формата и получала 404 — у пустой территории каждый раз.
        const [{ dataset, warnings }, manifest] = await Promise.all([
          loadDataset(createHttpDatasetSource({ baseUrl: DATA_BASE_URL })),
          fetchDiskManifest(),
        ]);

        if (cancelled) return;
        const planFiles = loadedPlanFiles(dataset.campusMeta, dataset.buildingMetas);
        loadData(dataset, warnings, manifest ? { planFiles: planFilesByHash(planFiles, manifest.files) } : {});
        // Черновик — после загрузки: он предлагается поверх уже открытых данных.
        await initStorage(manifest);
      } catch (cause) {
        console.error('Ошибка загрузки датасета:', cause);
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : 'Не удалось загрузить данные кампуса'
          );
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [loadData, initStorage]);

  if (isLoading && !error) {
    return (
      <div className="editor-splash">
        <div className="editor-splash__box">
          {/* `borderTopColor` задаётся явно: иначе inline-`borderColor`
              перекрывает утилиту `border-t-transparent`, и индикатор
              выглядит сплошным кольцом, а не вращающейся дугой. */}
          <div
            className="w-10 h-10 border-2 rounded-full animate-spin mx-auto mb-4"
            style={{
              borderColor: 'var(--editor-highlight)',
              borderTopColor: 'transparent',
            }}
          />
          <p className="editor-splash__text">Загрузка редактора…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="editor-splash">
        <div className="editor-splash__box">
          <h1 className="editor-splash__title">Ошибка загрузки</h1>
          <p className="editor-splash__text editor-splash__text--pre">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="editor-button editor-button--primary mt-4"
          >
            Перезагрузить
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      {/* Карта в середине, всё остальное — в закреплённых колонках вокруг:
          ни одна панель не лежит поверх плана (запись 39). */}
      <div className="editor-shell">
        <SandboxBanner />
        <TopBar />
        <div className="editor-body">
          <StructurePanel />
          {workspace === 'markup' && <ToolRail />}
          <main className="editor-workspace" aria-label="Карты">
            {/* Настройки инструмента — над вкладками, как в графических
                редакторах: они для активной карты (запись 66). */}
            {workspace === 'markup' && <ToolOptions />}
            <MapWindows />
          </main>
          <Inspector />
        </div>
        <StatusBar />

        <SearchPanel />
        <ContextMenu />
        <HelpDialog />
        <KindsDialog />
        <ImportDialog />
        <ImportDropZone />
        <DraftPrompt />
      </div>
    </ErrorBoundary>
  );
};

export default App;
