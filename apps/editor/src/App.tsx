import React, { useEffect, useState } from 'react';
import { createHttpDatasetSource, loadDataset } from '@campus-map/core';
import { EditorMap } from './components/Map/EditorMap';
import { Toolbar } from './components/UI/Toolbar';
import { LayersPanel } from './components/UI/LayersPanel';
import { StatusBar } from './components/UI/StatusBar';
import { PropertiesPanel } from './components/UI/PropertiesPanel';
import { DiagnosticsPanel } from './components/UI/DiagnosticsPanel';
import { LineToolPanel } from './components/Tools/LineToolPanel';
import { SearchPanel } from './components/UI/SearchPanel';
import { FilterPanel } from './components/UI/FilterPanel';
import { StatisticsPanel } from './components/UI/StatisticsPanel';
import { RouteSimulatorPanel } from './components/UI/RouteSimulator';
import { RecentActions } from './components/UI/RecentActions';
import { Notice } from './components/UI/Notice';
import { ContextMenu } from './components/UI/ContextMenu';
import { BookmarksPanel } from './components/UI/BookmarksPanel';
import { DraftPrompt } from './components/UI/DraftPrompt';
import { useEditorStore, useUnsavedChanges } from './stores/editorStore';
import { DATA_BASE_URL } from './config/dataBase';

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
        <div
          className="h-full w-full flex items-center justify-center p-6"
          style={{ backgroundColor: 'var(--editor-bg)' }}
        >
          <div className="max-w-md text-center">
            <h1 className="text-white font-semibold text-lg">Произошла ошибка</h1>
            <p className="mt-2 text-sm" style={{ color: 'var(--editor-text-muted)' }}>
              {this.state.error?.message || 'Неизвестная ошибка'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 rounded-lg text-white"
              style={{ backgroundColor: 'var(--editor-highlight)' }}
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
  useUnloadGuard();

  useEffect(() => {
    // StrictMode монтирует эффект дважды; без флага отмены второй запуск
    // перезаписывал состояние уже после завершения первого.
    let cancelled = false;

    const load = async () => {
      try {
        // Загрузка и нормализация датасета — задача ядра. Собственный обход
        // файлов здесь дублировал `loadDataset`, отличался от него поведением
        // на ошибках и глушил их пустыми `catch {}`: отсутствующий этаж или
        // битый JSON проходили незамеченными, а `building` и `floor` узлам
        // приходилось проставлять вручную, хотя загрузчик берёт их из пути.
        const { dataset, warnings } = await loadDataset(
          createHttpDatasetSource({ baseUrl: DATA_BASE_URL })
        );

        if (cancelled) return;
        loadData(dataset, warnings);
        // Манифест каталога данных и черновик — после загрузки: черновик
        // предлагается поверх уже открытых данных.
        await initStorage();
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
      <div
        className="h-full w-full flex items-center justify-center"
        style={{ backgroundColor: 'var(--editor-bg)' }}
      >
        <div className="text-center">
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
          <p style={{ color: 'var(--editor-text-muted)' }}>Загрузка редактора…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="h-full w-full flex items-center justify-center p-6"
        style={{ backgroundColor: 'var(--editor-bg)' }}
      >
        <div className="max-w-md text-center">
          <h1 className="text-white font-semibold text-lg">Ошибка загрузки</h1>
          <p className="mt-2 text-sm whitespace-pre-wrap" style={{ color: 'var(--editor-text-muted)' }}>
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 rounded-lg text-white"
            style={{ backgroundColor: 'var(--editor-highlight)' }}
          >
            Перезагрузить
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div
        className="h-full w-full flex flex-col"
        style={{ backgroundColor: 'var(--editor-bg)' }}
      >
        <Toolbar />
        <div className="flex-1 flex overflow-hidden">
          <LayersPanel />
          <div className="flex-1 relative overflow-hidden">
            <EditorMap />

            {/* Фильтры и закладки — одной колонкой справа от кнопок масштаба:
                раскрытая панель сдвигает следующую вниз. Раньше обе стояли
                абсолютно, и раскрытые «Фильтры» закрывали кнопку «Закладки». */}
            <div className="absolute top-3 left-16 bottom-3 z-[1600] flex flex-col items-start gap-2 pointer-events-none [&>*]:pointer-events-auto">
              <FilterPanel />
              <BookmarksPanel />
            </div>
            <StatisticsPanel />
            <PropertiesPanel />
            <DiagnosticsPanel />
            <LineToolPanel />
            <RouteSimulatorPanel />
            <RecentActions />
            <Notice />
          </div>
        </div>
        <StatusBar />

        <SearchPanel />
        <ContextMenu />
        <DraftPrompt />
      </div>
    </ErrorBoundary>
  );
};

export default App;
