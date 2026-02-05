import React, { useMemo } from 'react';
import { useEditorStore } from '../../stores/editorStore';

export const StatisticsPanel: React.FC = () => {
  const statisticsOpen = useEditorStore((s) => s.statisticsOpen);
  const setStatisticsOpen = useEditorStore((s) => s.setStatisticsOpen);

  const nodes = useEditorStore((s) => s.nodes);
  const transitions = useEditorStore((s) => s.transitions);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  const aliases = useEditorStore((s) => s.aliases);
  const currentBuilding = useEditorStore((s) => s.currentBuilding);
  const currentFloor = useEditorStore((s) => s.currentFloor);

  const isGraphConnected = useEditorStore((s) => s.isGraphConnected);
  const getOrphanNodes = useEditorStore((s) => s.getOrphanNodes);
  const getNodesWithoutAlias = useEditorStore((s) => s.getNodesWithoutAlias);

  const stats = useMemo(() => {
    const allNodes = Array.from(nodes.values());
    const floorNodes = currentBuilding
      ? allNodes.filter(n => n.building === currentBuilding && n.floor === currentFloor)
      : allNodes.filter(n => n.building === 'CAMPUS');

    const portalNodes = floorNodes.filter(n => n.isPortal);
    const totalEdges = floorNodes.reduce((sum, n) => sum + n.neighbors.length, 0) / 2;
    const avgConnections = floorNodes.length > 0 
      ? (floorNodes.reduce((sum, n) => sum + n.neighbors.length, 0) / floorNodes.length).toFixed(1)
      : '0';

    const nodesWithAliases = floorNodes.filter(n => (aliases.get(n.id) || []).length > 0);
    const connectivity = isGraphConnected();

    return {
      totalNodes: allNodes.length,
      floorNodes: floorNodes.length,
      portalNodes: portalNodes.length,
      totalEdges: Math.round(totalEdges),
      totalTransitions: transitions.length,
      avgConnections,
      orphanNodes: getOrphanNodes().length,
      nodesWithAliases: nodesWithAliases.length,
      nodesWithoutAlias: getNodesWithoutAlias().length,
      aliasPercentage: floorNodes.length > 0 
        ? Math.round((nodesWithAliases.length / floorNodes.length) * 100)
        : 0,
      isConnected: connectivity.connected,
      componentCount: connectivity.components.length,
      buildings: buildingMetas.size,
    };
  }, [nodes, transitions, buildingMetas, aliases, currentBuilding, currentFloor, isGraphConnected, getOrphanNodes, getNodesWithoutAlias]);

  if (!statisticsOpen) {
    return (
      <button
        onClick={() => setStatisticsOpen(true)}
        className="absolute top-3 right-3 z-[1500] px-3 py-2 rounded-xl text-sm font-medium shadow-lg"
        style={{
          backgroundColor: 'var(--editor-panel)',
          border: '1px solid var(--editor-border)',
          color: 'white',
        }}
      >
        📊 Статистика
      </button>
    );
  }

  return (
    <div
      className="absolute top-3 right-3 w-80 z-[1500] rounded-2xl shadow-2xl overflow-hidden"
      style={{
        backgroundColor: 'var(--editor-panel)',
        border: '1px solid var(--editor-border)',
      }}
    >
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--editor-border)' }}>
        <div className="text-white font-semibold">📊 Статистика</div>
        <button
          onClick={() => setStatisticsOpen(false)}
          className="p-1 rounded hover:bg-white/10"
          style={{ color: 'var(--editor-text-muted)' }}
        >
          ✕
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Общие */}
        <section>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--editor-text-muted)' }}>
            Общее
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Всего узлов" value={stats.totalNodes} icon="📍" />
            <StatCard label="На этаже" value={stats.floorNodes} icon="🏠" />
            <StatCard label="Порталов" value={stats.portalNodes} icon="⭐" />
            <StatCard label="Корпусов" value={stats.buildings} icon="🏢" />
          </div>
        </section>

        {/* Связи */}
        <section>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--editor-text-muted)' }}>
            Связи
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Рёбер" value={stats.totalEdges} icon="🔗" />
            <StatCard label="Переходов" value={stats.totalTransitions} icon="🚪" />
            <StatCard label="Сирот" value={stats.orphanNodes} icon="🚫" color={stats.orphanNodes > 0 ? '#ef4444' : undefined} />
            <StatCard label="Среднее связей" value={stats.avgConnections} icon="📈" />
          </div>
        </section>

        {/* Связность */}
        <section>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--editor-text-muted)' }}>
            Связность графа
          </div>
          <div 
            className="rounded-xl p-3 flex items-center gap-3"
            style={{ 
              backgroundColor: stats.isConnected ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${stats.isConnected ? '#22c55e' : '#ef4444'}`,
            }}
          >
            <span className="text-2xl">{stats.isConnected ? '✅' : '⚠️'}</span>
            <div>
              <div className="text-sm text-white font-medium">
                {stats.isConnected ? 'Граф связен' : 'Граф не связен'}
              </div>
              <div className="text-xs" style={{ color: 'var(--editor-text-muted)' }}>
                {stats.componentCount} компонент{stats.componentCount === 1 ? 'а' : stats.componentCount < 5 ? 'ы' : ''}
              </div>
            </div>
          </div>
        </section>

        {/* Алиасы */}
        <section>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--editor-text-muted)' }}>
            Заполненность алиасов
          </div>
          <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--editor-bg)', border: '1px solid var(--editor-border)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-white">{stats.nodesWithAliases} / {stats.floorNodes}</span>
              <span className="text-sm font-medium" style={{ color: stats.aliasPercentage >= 80 ? '#22c55e' : stats.aliasPercentage >= 50 ? '#f59e0b' : '#ef4444' }}>
                {stats.aliasPercentage}%
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--editor-panel)' }}>
              <div 
                className="h-full rounded-full transition-all"
                style={{ 
                  width: `${stats.aliasPercentage}%`,
                  backgroundColor: stats.aliasPercentage >= 80 ? '#22c55e' : stats.aliasPercentage >= 50 ? '#f59e0b' : '#ef4444',
                }}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: number | string; icon: string; color?: string }> = ({ label, value, icon, color }) => (
  <div 
    className="rounded-lg p-2"
    style={{ backgroundColor: 'var(--editor-bg)', border: '1px solid var(--editor-border)' }}
  >
    <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--editor-text-muted)' }}>
      <span>{icon}</span>
      <span>{label}</span>
    </div>
    <div className="text-lg font-semibold" style={{ color: color || 'white' }}>
      {value}
    </div>
  </div>
);