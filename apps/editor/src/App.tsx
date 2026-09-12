import React, { useEffect, useState } from 'react';
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
import { ContextMenu } from './components/UI/ContextMenu';
import { EdgeContextMenu } from './components/UI/EdgeContextMenu';
import { BookmarksPanel } from './components/UI/BookmarksPanel';
import { useEditorStore } from './stores/editorStore';

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
    console.error('Editor error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full flex items-center justify-center p-6" style={{ backgroundColor: 'var(--editor-bg)' }}>
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

const App: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const isLoading = useEditorStore((s) => s.isLoading);
  const loadData = useEditorStore((s) => s.loadData);

  useEffect(() => {
    const load = async () => {
      try {
        const campusMeta = await fetch('/data/campus/meta.json').then((r) => {
          if (!r.ok) throw new Error(`Failed to load campus meta: ${r.status}`);
          return r.json();
        });
        
        const campusGraph = await fetch('/data/campus/graph.json').then((r) => {
          if (!r.ok) throw new Error(`Failed to load campus graph: ${r.status}`);
          return r.json();
        });

        const allNodes = (campusGraph.nodes ?? []).map((n: any) => ({
          id: n.id,
          x: n.x ?? 0,
          y: n.y ?? 0,
          building: n.building ?? 'CAMPUS',
          floor: n.floor ?? 0,
          neighbors: n.neighbors ?? [],
          isPortal: n.isPortal ?? false,
        }));

        const buildingMetas: any[] = [];
        for (const b of campusMeta.buildings ?? []) {
          try {
            const meta = await fetch(`/data/buildings/${b.id}/meta.json`).then((r) => r.ok ? r.json() : null);
            if (!meta) continue;
            buildingMetas.push(meta);

            for (const fl of meta.floors ?? []) {
              try {
                const fg = await fetch(`/data/buildings/${b.id}/floors/${fl.floor}/graph.json`).then((r) => r.ok ? r.json() : null);
                if (!fg) continue;
                
                const floorNodes = (fg.nodes ?? []).map((n: any) => ({
                  id: n.id,
                  x: n.x ?? 0,
                  y: n.y ?? 0,
                  building: b.id,
                  floor: fl.floor,
                  neighbors: n.neighbors ?? [],
                  isPortal: n.isPortal ?? false,
                }));
                allNodes.push(...floorNodes);
              } catch {}
            }
          } catch {}
        }

        let transitions: any[] = [];
        try {
          const tdata = await fetch('/data/transitions.json').then((r) => r.ok ? r.json() : { transitions: [] });
          transitions = (tdata.transitions ?? []).map((t: any) => ({
            fromNode: t.from?.node ?? t.fromNode,
            toNode: t.to?.node ?? t.toNode,
            type: t.transition_type ?? t.type ?? 'unknown',
          }));
        } catch { transitions = []; }

        let aliases: { id: string; names: string[] }[] = [];
        try {
          const adata = await fetch('/data/aliases.json').then((r) => r.ok ? r.json() : { aliases: [] });
          aliases = (adata.aliases ?? []).map((a: any) => ({
            id: a.id,
            names: a.names ?? (a.name ? [a.name] : []),
          }));
        } catch { aliases = []; }

        loadData({ nodes: allNodes, transitions, buildingMetas, aliases });
      } catch (e) {
        console.error('Load error:', e);
        setError(e instanceof Error ? e.message : 'Unknown error');
      }
    };

    load();
  }, [loadData]);

  if (isLoading && !error) {
    return (
      <div className="h-full w-full flex items-center justify-center" style={{ backgroundColor: 'var(--editor-bg)' }}>
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-4" style={{ borderColor: 'var(--editor-highlight)' }} />
          <p style={{ color: 'var(--editor-text-muted)' }}>Загрузка редактора…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full w-full flex items-center justify-center p-6" style={{ backgroundColor: 'var(--editor-bg)' }}>
        <div className="max-w-md text-center">
          <h1 className="text-white font-semibold text-lg">Ошибка загрузки</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--editor-text-muted)' }}>{error}</p>
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
      <div className="h-full w-full flex flex-col" style={{ backgroundColor: 'var(--editor-bg)' }}>
        <Toolbar />
        <div className="flex-1 flex overflow-hidden">
          <LayersPanel />
          <div className="flex-1 relative overflow-hidden">
            <EditorMap />
            
            {/* Panels */}
            <FilterPanel />
            <BookmarksPanel />
            <StatisticsPanel />
            <PropertiesPanel />
            <DiagnosticsPanel />
            <LineToolPanel />
            <RouteSimulatorPanel />
            <RecentActions />
          </div>
        </div>
        <StatusBar />
        
        {/* Modals */}
        <SearchPanel />
        <ContextMenu />
        <EdgeContextMenu />
      </div>
    </ErrorBoundary>
  );
};

export default App;