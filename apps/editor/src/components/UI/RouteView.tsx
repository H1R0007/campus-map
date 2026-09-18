import React, { useEffect, useMemo, useState } from 'react';
import { selectedRoute, useEditorStore } from '../../stores/editorStore';
import { Icon } from './Icon';

/**
 * Время маршрута для разметчика — точнее, чем «~4 мин» в навигаторе.
 *
 * По этой строке проверяют привязку планов к метрике: ошибка в масштабе или
 * отметке этажа видна как неправдоподобное время, а округление до минут её
 * спрятало бы.
 */
function formatRouteTime(seconds: number): string {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  return minutes > 0 ? `${minutes} мин ${total % 60} с` : `${total} с`;
}

/**
 * Переключатель выбора точек:
 * - включён — щелчок по узлу на карте задаёт начало или конец маршрута;
 * - выключен — щелчок выбирает узел как обычно, точки задаются поиском.
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
        Щелчок по карте
      </div>

      <button
        type="button"
        onClick={() => onChange(!enabled)}
        className="relative w-12 h-6 rounded-full transition-colors"
        style={{ backgroundColor: enabled ? '#22c55e' : 'var(--editor-accent)' }}
        title={enabled ? 'Включено: щелчок по узлу выбирает начало или конец' : 'Выключено: точки — только через поиск'}
      >
        <div
          className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow"
          style={{ left: enabled ? 'calc(100% - 20px)' : '4px' }}
        />
      </button>

      <div className="text-xs" style={{ color: !enabled ? 'white' : 'var(--editor-text-muted)' }}>
        Только поиск
      </div>
    </div>
  );
};

/**
 * Вкладка «Маршрут» инспектора: маршрут между двумя узлами так, как его
 * построит навигатор, с длиной и временем.
 */
export const RouteView: React.FC = () => {
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
  const playing = useEditorStore((s) => s.routeSimulation.playing);
  const setRoutePlaying = useEditorStore((s) => s.setRoutePlaying);
  const follow = useEditorStore((s) => s.routeSimulation.follow);
  const setRouteFollow = useEditorStore((s) => s.setRouteFollow);

  const searchNodes = useEditorStore((s) => s.searchNodes);
  const getNode = useEditorStore((s) => s.getNode);
  const getNodeAliases = useEditorStore((s) => s.getNodeAliases);
  const centerOnNode = useEditorStore((s) => s.centerOnNode);

  const [fromQuery, setFromQuery] = useState('');
  const [toQuery, setToQuery] = useState('');
  const [fromResults, setFromResults] = useState<ReturnType<typeof searchNodes>>([]);
  const [toResults, setToResults] = useState<ReturnType<typeof searchNodes>>([]);

  // Найденные маршруты и выбранный из них. Правило выбора одно на весь
  // редактор — `selectedRoute`.
  const routes = route.routes;
  const currentRoute = useMemo(
    () => selectedRoute({ routes, selectedPathIndex }),
    [routes, selectedPathIndex]
  );
  const currentPath = useMemo(() => currentRoute?.path ?? [], [currentRoute]);

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
      routes: [],
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
      routes: [],
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
      routes: [],
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

  return (
    <div className="space-y-3">
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
                ? 'Щелчок по узлу — начало маршрута'
                : 'Щелчок по узлу — конец маршрута'}
            </div>
          )}
        </div>

        {/* FROM */}
        <div className="relative">
          <div className="flex items-center justify-between">
            <label className="text-xs" style={{ color: 'var(--editor-text-muted)' }}>
              <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="w-2.5 h-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: '#22c55e' }} />Откуда</span>
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
            placeholder="Поиск или щелчок по узлу…"
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
              <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="w-2.5 h-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: '#ef4444' }} />Куда</span>
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
            placeholder="Поиск или щелчок по узлу…"
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

              {/* Длина и время — главная проверка привязки планов к метрике */}
              <div className="mt-1 text-xs" style={{ color: 'var(--editor-text-muted)' }}>
                {currentRoute && currentRoute.distanceMeters !== null && currentRoute.durationSeconds !== null
                  ? `${Math.round(currentRoute.distanceMeters)} м · ${formatRouteTime(currentRoute.durationSeconds)}`
                  : 'Длины и времени нет: планы не привязаны к метрике кампуса'}
              </div>

              {pathInfo?.multiLevel && (
                <div className="mt-2 text-xs" style={{ color: 'var(--editor-text-muted)' }}>
                  <Icon name="warning" size={12} className="inline-block mr-1 align-middle" />
                  Путь идёт через разные этажи или корпуса. Участки на других планах не видны;
                  чтобы карта шла за меткой, включите «Вести карту за меткой».
                </div>
              )}

              {/* alternatives */}
              {routes.length > 1 && (
                <div className="mt-3">
                  <div className="text-xs mb-1" style={{ color: 'var(--editor-text-muted)' }}>
                    Альтернативы (как в навигаторах):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {routes.map((alternative, i) => {
                      const p = alternative.path;
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

            {/* Движение метки по маршруту */}
            <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--editor-bg)', border: '1px solid var(--editor-border)' }}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRoutePlaying(!playing)}
                  className="px-3 py-2 rounded-lg text-sm"
                  style={{ backgroundColor: 'var(--editor-accent)', color: 'white' }}
                >
                  {playing ? 'Пауза' : 'Продолжить'}
                </button>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={follow}
                    onChange={(event) => setRouteFollow(event.target.checked)}
                    className="w-4 h-4"
                  />
                  <span style={{ color: follow ? 'white' : 'var(--editor-text-muted)' }}>Вести карту за меткой</span>
                </label>
              </div>
              <p className="mt-2 text-xs" style={{ color: 'var(--editor-text-muted)' }}>
                Метка идёт по маршруту, пока открыта эта вкладка. С «вести карту» редактор сам открывает
                план, по которому метка идёт сейчас; любое переключение плана вручную это выключает.
              </p>

              <div className="flex items-center justify-between mt-3 mb-2">
                <div className="text-xs" style={{ color: 'var(--editor-text-muted)' }}>
                  <span className="inline-flex items-center gap-1.5"><Icon name="clock" size={12} />Скорость движения метки</span>
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
                Точки маршрута — щелчок открывает план точки
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
                      {/* Цвета старта и финиша — те же, что у точек маршрута на карте (`EditorNodes`). */}
                      <span
                        aria-hidden="true"
                        className="w-2.5 h-2.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: isStart ? '#22c55e' : isEnd ? '#ef4444' : 'var(--editor-text-muted)' }}
                      />
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

            {routePickMode && (
              <div className="text-xs" style={{ color: 'var(--editor-text-muted)' }}>
                Пока включён выбор точек, щелчок по узлу задаёт точку маршрута, а не выбирает узел.
              </div>
            )}
          </div>
        )}
    </div>
  );
};
