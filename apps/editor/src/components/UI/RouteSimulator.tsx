import React, { useEffect, useMemo, useState } from 'react';
import { CircleMarker, Polyline } from 'react-leaflet';
import { isNodeInScope, scopeOfFloor } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';

/**
 * Toggle:
 * - routePickMode=true  => ПКМ на карте выбирает from/to
 * - routePickMode=false => ПКМ работает как обычно (свойства/drag), выбор только через поиск
 */
const PickModeToggle: React.FC<{
  enabled: boolean;
  onChange: (v: boolean) => void;
}> = ({ enabled, onChange }) => {
  return (
    <div
      className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl"
      style={{ backgroundColor: 'var(--editor-bg)', border: '1px solid var(--editor-border)' }}
    >
      <div className="text-xs" style={{ color: enabled ? 'white' : 'var(--editor-text-muted)' }}>
        🖱️ ПКМ на карте
      </div>

      <button
        type="button"
        onClick={() => onChange(!enabled)}
        className="relative w-12 h-6 rounded-full transition-colors"
        style={{ backgroundColor: enabled ? '#22c55e' : 'var(--editor-accent)' }}
        title={enabled ? 'Включено: ПКМ по точке выбирает старт/финиш' : 'Выключено: выбор только через поиск'}
      >
        <div
          className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow"
          style={{ left: enabled ? 'calc(100% - 20px)' : '4px' }}
        />
      </button>

      <div className="text-xs" style={{ color: !enabled ? 'white' : 'var(--editor-text-muted)' }}>
        ⌨️ Только поиск
      </div>
    </div>
  );
};

export const RouteSimulatorPanel: React.FC = () => {
  const open = useEditorStore((s) => s.routeSimulatorOpen);
  const setOpen = useEditorStore((s) => s.setRouteSimulatorOpen);

  const routePickMode = useEditorStore((s) => s.routePickMode);
  const setRoutePickMode = useEditorStore((s) => s.setRoutePickMode);
  const routePickTarget = useEditorStore((s) => s.routePickTarget);
  const setRoutePickTarget = useEditorStore((s) => s.setRoutePickTarget);

  const route = useEditorStore((s) => s.routeSimulation);
  const setRouteSimulation = useEditorStore((s) => s.setRouteSimulation);
  const calculateRoute = useEditorStore((s) => s.calculateRoute);

  const selectedPathIndex = useEditorStore((s) => s.routeSimulation.selectedPathIndex);
  const setRouteSelectedPath = useEditorStore((s) => s.setRouteSelectedPath);

  const animationSpeed = useEditorStore((s) => s.routeSimulation.animationSpeed);
  const setRouteAnimationSpeed = useEditorStore((s) => s.setRouteAnimationSpeed);

  const searchNodes = useEditorStore((s) => s.searchNodes);
  const getNode = useEditorStore((s) => s.getNode);
  const getNodeAliases = useEditorStore((s) => s.getNodeAliases);
  const centerOnNode = useEditorStore((s) => s.centerOnNode);

  const [fromQuery, setFromQuery] = useState('');
  const [toQuery, setToQuery] = useState('');
  const [fromResults, setFromResults] = useState<ReturnType<typeof searchNodes>>([]);
  const [toResults, setToResults] = useState<ReturnType<typeof searchNodes>>([]);

  // Все доступные пути (чтобы логика выбора была как в навигаторах)
  const allPaths = useMemo(() => {
    if (route.alternativePaths && route.alternativePaths.length > 0) return route.alternativePaths;
    if (route.path && route.path.length > 0) return [route.path];
    return [];
  }, [route.alternativePaths, route.path]);

  const currentPath = useMemo(() => {
    if (allPaths.length === 0) return [];
    return allPaths[selectedPathIndex] ?? allPaths[0] ?? [];
  }, [allPaths, selectedPathIndex]);

  // синхронизация инпутов с выбранными id
  useEffect(() => {
    if (route.fromNodeId) {
      const a = getNodeAliases(route.fromNodeId);
      setFromQuery(a[0] || route.fromNodeId);
    } else if (!fromQuery.trim()) {
      // noop
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.fromNodeId]);

  useEffect(() => {
    if (route.toNodeId) {
      const a = getNodeAliases(route.toNodeId);
      setToQuery(a[0] || route.toNodeId);
    } else if (!toQuery.trim()) {
      // noop
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.toNodeId]);

  useEffect(() => {
    if (route.fromNodeId) {
      setFromResults([]);
      return;
    }
    const q = fromQuery.trim();
    if (!q) {
      setFromResults([]);
      return;
    }
    setFromResults(searchNodes(q).slice(0, 6));
  }, [fromQuery, route.fromNodeId, searchNodes]);

  useEffect(() => {
    if (route.toNodeId) {
      setToResults([]);
      return;
    }
    const q = toQuery.trim();
    if (!q) {
      setToResults([]);
      return;
    }
    setToResults(searchNodes(q).slice(0, 6));
  }, [toQuery, route.toNodeId, searchNodes]);

  const selectFrom = (nodeId: string) => {
    setRouteSimulation({
      fromNodeId: nodeId,
      // не сбрасываем pickMode
    });
    setFromResults([]);
    setRoutePickTarget('to');
    // важно: без агрессивного зума, сохраняем текущий zoom
    centerOnNode(nodeId, true);
  };

  const selectTo = (nodeId: string) => {
    setRouteSimulation({ toNodeId: nodeId });
    setToResults([]);
    setRoutePickTarget(null);
  };

  const clearFrom = () => {
    setRouteSimulation({
      fromNodeId: null,
      active: false,
      path: [],
      alternativePaths: [],
      selectedPathIndex: 0,
      animationIndex: 0,
    });
    setFromQuery('');
    setRoutePickTarget('from');
  };

  const clearTo = () => {
    setRouteSimulation({
      toNodeId: null,
      active: false,
      path: [],
      alternativePaths: [],
      selectedPathIndex: 0,
      animationIndex: 0,
    });
    setToQuery('');
    setRoutePickTarget('to');
  };

  const handleBuild = () => {
    if (!route.fromNodeId || !route.toNodeId) return;
    calculateRoute(route.fromNodeId, route.toNodeId);
  };

  const handleReset = () => {
    // СБРОС единственный кто убирает путь/анимацию
    setRouteSimulation({
      active: false,
      fromNodeId: null,
      toNodeId: null,
      path: [],
      alternativePaths: [],
      animationIndex: 0,
      selectedPathIndex: 0,
    });
    setFromQuery('');
    setToQuery('');
    setFromResults([]);
    setToResults([]);
    setRoutePickTarget('from');
  };

  const gotoNode = (nodeId: string) => {
    // Без агрессивного зума — сохраняем текущий zoom
    centerOnNode(nodeId, true);
  };

  const pathInfo = useMemo(() => {
    if (currentPath.length === 0) return null;

    const buildings = new Set<string>();
    const floorsByBuilding = new Map<string, Set<number>>();

    for (const id of currentPath) {
      const n = getNode(id);
      if (!n) continue;
      buildings.add(n.building);
      if (!floorsByBuilding.has(n.building)) floorsByBuilding.set(n.building, new Set<number>());
      floorsByBuilding.get(n.building)!.add(n.floor);
    }

    let multi = false;
    if (buildings.size > 1) multi = true;
    for (const [, floors] of floorsByBuilding) if (floors.size > 1) multi = true;

    return {
      nodeCount: currentPath.length,
      multiLevel: multi,
      buildings: Array.from(buildings),
    };
  }, [currentPath, getNode]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute top-16 right-3 z-[1400] px-3 py-2 rounded-xl text-sm font-medium shadow-lg"
        style={{ backgroundColor: 'var(--editor-panel)', border: '1px solid var(--editor-border)', color: 'white' }}
      >
        🧭 Маршрут
      </button>
    );
  }

  return (
    <div
      className="absolute top-16 right-3 w-[390px] z-[1400] rounded-2xl shadow-2xl overflow-hidden"
      style={{ backgroundColor: 'var(--editor-panel)', border: '1px solid var(--editor-border)' }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--editor-border)' }}>
        <div className="text-white font-semibold">🧭 Симуляция маршрута</div>
        <button
          onClick={() => setOpen(false)}
          className="p-1 rounded hover:bg-white/10"
          style={{ color: 'var(--editor-text-muted)' }}
          title="Скрыть (маршрут останется)"
          type="button"
        >
          ✕
        </button>
      </div>

      <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
        {/* Pick mode */}
        <div className="space-y-2">
          <div className="text-xs" style={{ color: 'var(--editor-text-muted)' }}>
            Выбор точек мышью
          </div>
          <PickModeToggle enabled={routePickMode} onChange={setRoutePickMode} />
          {routePickMode && (
            <div
              className="text-xs p-2 rounded-lg"
              style={{ backgroundColor: 'rgba(96, 165, 250, 0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)' }}
            >
              {routePickTarget === 'from' || !route.fromNodeId
                ? 'ПКМ по точке — выбрать СТАРТ'
                : 'ПКМ по точке — выбрать ФИНИШ'}
            </div>
          )}
        </div>

        {/* FROM */}
        <div className="relative">
          <div className="flex items-center justify-between">
            <label className="text-xs" style={{ color: 'var(--editor-text-muted)' }}>
              🟢 Откуда
            </label>
            {route.fromNodeId && (
              <button type="button" onClick={clearFrom} className="text-xs hover:underline" style={{ color: '#fca5a5' }}>
                сброс
              </button>
            )}
          </div>

          <input
            value={fromQuery}
            disabled={!!route.fromNodeId}
            onFocus={() => setRoutePickTarget('from')}
            onChange={(e) => {
              setFromQuery(e.target.value);
              if (route.fromNodeId) setRouteSimulation({ fromNodeId: null });
            }}
            placeholder="Поиск или ПКМ на карте…"
            className="mt-1 w-full px-3 py-2 rounded-lg text-sm disabled:opacity-70"
            style={{ backgroundColor: 'var(--editor-bg)', border: '1px solid var(--editor-border)', color: 'white' }}
          />

          {!route.fromNodeId && fromResults.length > 0 && (
            <div
              className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-10"
              style={{ backgroundColor: 'var(--editor-panel)', border: '1px solid var(--editor-border)' }}
            >
              {fromResults.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => selectFrom(n.id)}
                  className="w-full px-3 py-2 text-left hover:bg-white/10"
                  style={{ color: 'white' }}
                >
                  <div className="text-sm">{getNodeAliases(n.id)[0] || n.id}</div>
                  <div className="text-xs" style={{ color: 'var(--editor-text-muted)' }}>
                    {n.building} / этаж {n.floor}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* TO */}
        <div className="relative">
          <div className="flex items-center justify-between">
            <label className="text-xs" style={{ color: 'var(--editor-text-muted)' }}>
              🔴 Куда
            </label>
            {route.toNodeId && (
              <button type="button" onClick={clearTo} className="text-xs hover:underline" style={{ color: '#fca5a5' }}>
                сброс
              </button>
            )}
          </div>

          <input
            value={toQuery}
            disabled={!!route.toNodeId}
            onFocus={() => setRoutePickTarget('to')}
            onChange={(e) => {
              setToQuery(e.target.value);
              if (route.toNodeId) setRouteSimulation({ toNodeId: null });
            }}
            placeholder="Поиск или ПКМ на карте…"
            className="mt-1 w-full px-3 py-2 rounded-lg text-sm disabled:opacity-70"
            style={{ backgroundColor: 'var(--editor-bg)', border: '1px solid var(--editor-border)', color: 'white' }}
          />

          {!route.toNodeId && toResults.length > 0 && (
            <div
              className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-10"
              style={{ backgroundColor: 'var(--editor-panel)', border: '1px solid var(--editor-border)' }}
            >
              {toResults.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => selectTo(n.id)}
                  className="w-full px-3 py-2 text-left hover:bg-white/10"
                  style={{ color: 'white' }}
                >
                  <div className="text-sm">{getNodeAliases(n.id)[0] || n.id}</div>
                  <div className="text-xs" style={{ color: 'var(--editor-text-muted)' }}>
                    {n.building} / этаж {n.floor}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* actions */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleBuild}
            disabled={!route.fromNodeId || !route.toNodeId}
            className="flex-1 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: 'var(--editor-highlight)', color: 'white' }}
          >
            Построить
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 rounded-xl text-sm"
            style={{ backgroundColor: 'var(--editor-accent)', color: 'white' }}
            title="Сбросить маршрут и анимацию"
          >
            Сброс
          </button>
        </div>

        {/* result */}
        {route.active && (
          <div className="space-y-3">
            <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--editor-bg)', border: '1px solid var(--editor-border)' }}>
              <div className="flex items-center justify-between">
                <div className="text-sm text-white font-medium">Маршрут</div>
                <div className="text-xs" style={{ color: 'var(--editor-text-muted)' }}>
                  {currentPath.length} точек
                </div>
              </div>

              {pathInfo?.multiLevel && (
                <div className="mt-2 text-xs" style={{ color: '#fbbf24' }}>
                  ⚠️ Путь проходит через разные корпуса/этажи (переключение вида будет автоматическим).
                </div>
              )}

              {/* alternatives */}
              {allPaths.length > 1 && (
                <div className="mt-3">
                  <div className="text-xs mb-1" style={{ color: 'var(--editor-text-muted)' }}>
                    Альтернативы (как в навигаторах):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {allPaths.map((p, i) => {
                      const active = i === selectedPathIndex;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setRouteSelectedPath(i)}
                          className="px-3 py-1.5 rounded-lg text-xs transition-all"
                          style={{
                            backgroundColor: active ? 'var(--editor-highlight)' : 'var(--editor-accent)',
                            color: 'white',
                            border: active ? '1px solid rgba(255,255,255,0.5)' : '1px solid transparent',
                          }}
                          title={`Путь ${i + 1}, длина ${p.length}`}
                        >
                          Путь {i + 1} ({p.length})
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* speed */}
            <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--editor-bg)', border: '1px solid var(--editor-border)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs" style={{ color: 'var(--editor-text-muted)' }}>
                  ⏱️ Скорость анимации
                </div>
                <div className="text-xs font-mono" style={{ color: 'white' }}>
                  {animationSpeed} ms
                </div>
              </div>
              <input
                type="range"
                min={80}
                max={3000}
                step={20}
                value={animationSpeed}
                onChange={(e) => setRouteAnimationSpeed(parseInt(e.target.value, 10))}
                className="w-full"
                style={{ accentColor: 'var(--editor-highlight)' }}
              />
              <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--editor-text-muted)' }}>
                <span>быстро</span>
                <span>медленно</span>
              </div>
            </div>

            {/* nodes list */}
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--editor-bg)', border: '1px solid var(--editor-border)' }}>
              <div className="px-3 py-2 text-xs font-medium" style={{ borderBottom: '1px solid var(--editor-border)', color: 'var(--editor-text-muted)' }}>
                Точки (клик — перейти без изменения zoom)
              </div>
              <div className="max-h-56 overflow-y-auto">
                {currentPath.map((id, idx) => {
                  const n = getNode(id);
                  const title = (getNodeAliases(id)[0] || id) + (n ? ` — ${n.building}/${n.floor}` : '');
                  const isStart = idx === 0;
                  const isEnd = idx === currentPath.length - 1;

                  return (
                    <button
                      key={`${id}-${idx}`}
                      type="button"
                      onClick={() => gotoNode(id)}
                      className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-white/5"
                      style={{ borderBottom: '1px solid var(--editor-border)' }}
                      title={title}
                    >
                      <span className="text-base">{isStart ? '🟢' : isEnd ? '🔴' : '⚪'}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-white truncate">{getNodeAliases(id)[0] || id}</div>
                        <div className="text-xs truncate" style={{ color: 'var(--editor-text-muted)' }}>
                          {n ? `${n.building} / этаж ${n.floor}` : '—'}
                        </div>
                      </div>
                      <div className="text-[10px] font-mono" style={{ color: 'var(--editor-text-muted)' }}>
                        #{idx + 1}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* hint */}
            {routePickMode && (
              <div className="text-xs" style={{ color: 'var(--editor-text-muted)' }}>
                Подсказка: при активном режиме выбора ПКМ по узлу будет выбирать старт/финиш вместо открытия свойств.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Overlay: рисует путь и двигает маркер.
 * Важно:
 * - использует выбранный путь selectedPathIndex
 * - учитывает animationSpeed из store
 * - автоматически переключает корпус/этаж на каждом шаге (navigateToNode)
 */
export const RouteOverlay: React.FC = () => {
  const route = useEditorStore((s) => s.routeSimulation);
  const getNode = useEditorStore((s) => s.getNode);
  const navigateToNode = useEditorStore((s) => s.navigateToNode);

  const currentBuilding = useEditorStore((s) => s.currentBuilding);
  const currentFloor = useEditorStore((s) => s.currentFloor);

  // Часть маршрута, относящаяся к текущему срезу. Правило принадлежности
  // узла виду берётся из ядра: оно же используется слоями карты навигатора.
  const scope = useMemo(
    () => scopeOfFloor(currentBuilding, currentFloor),
    [currentBuilding, currentFloor]
  );

  const path = useMemo(() => {
    if (route.alternativePaths && route.alternativePaths.length > 0) {
      return route.alternativePaths[route.selectedPathIndex] ?? route.alternativePaths[0] ?? [];
    }
    return route.path ?? [];
  }, [route.alternativePaths, route.path, route.selectedPathIndex]);

  // step timer
  useEffect(() => {
    if (!route.active || path.length < 2) return;

    const t = window.setInterval(() => {
      useEditorStore.setState((s) => {
        const p =
          s.routeSimulation.alternativePaths?.length > 0
            ? s.routeSimulation.alternativePaths[s.routeSimulation.selectedPathIndex] ?? s.routeSimulation.alternativePaths[0] ?? []
            : s.routeSimulation.path ?? [];

        if (!s.routeSimulation.active || p.length < 2) return;

        const next = (s.routeSimulation.animationIndex + 1) % p.length;
        s.routeSimulation.animationIndex = next;

        const nodeId = p[next];
        if (nodeId) {
          // переключаем корпус/этаж под анимацию
          // (без изменения зума: просто вид)
          setTimeout(() => {
            navigateToNode(nodeId);
          }, 0);
        }
      });
    }, route.animationSpeed);

    return () => window.clearInterval(t);
  }, [route.active, route.animationSpeed, route.selectedPathIndex, path.length, navigateToNode]);

  if (!route.active || path.length === 0) return null;

  const visiblePositions: [number, number][] = [];
  for (const id of path) {
    const n = getNode(id);
    if (!n) continue;

    if (isNodeInScope(n, scope)) visiblePositions.push([n.y, n.x]);
  }

  if (visiblePositions.length === 0) return null;

  const animNodeId = path[route.animationIndex];
  const animNode = getNode(animNodeId);

  const animVisible =
    animNode &&
    isNodeInScope(animNode, scope);

  const startNode = getNode(path[0]);
  const endNode = getNode(path[path.length - 1]);

  const startVisible =
    startNode &&
    isNodeInScope(startNode, scope);

  const endVisible =
    endNode && isNodeInScope(endNode, scope);

  return (
    <>
      {/* Route polyline */}
      {visiblePositions.length > 1 && (
        <Polyline
          positions={visiblePositions}
          pathOptions={{ color: '#8b5cf6', weight: 5, opacity: 0.85, dashArray: '10 6' }}
        />
      )}

      {/* Animated marker */}
      {animVisible && animNode && (
        <>
          <CircleMarker
            center={[animNode.y, animNode.x]}
            radius={18}
            pathOptions={{ color: '#8b5cf6', fillColor: '#8b5cf6', fillOpacity: 0.18, weight: 2 }}
          />
          <CircleMarker
            center={[animNode.y, animNode.x]}
            radius={10}
            pathOptions={{ color: '#ffffff', fillColor: '#8b5cf6', fillOpacity: 1, weight: 3 }}
          />
        </>
      )}

      {/* Start */}
      {startVisible && startNode && (
        <CircleMarker
          center={[startNode.y, startNode.x]}
          radius={12}
          pathOptions={{ color: '#ffffff', fillColor: '#22c55e', fillOpacity: 1, weight: 3 }}
        />
      )}

      {/* End */}
      {endVisible && endNode && (
        <CircleMarker
          center={[endNode.y, endNode.x]}
          radius={12}
          pathOptions={{ color: '#ffffff', fillColor: '#ef4444', fillOpacity: 1, weight: 3 }}
        />
      )}
    </>
  );
};
