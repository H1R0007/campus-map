import React, { useEffect, useMemo, useState } from 'react';
import type { MapNode } from '@campus-map/core';
import { selectedRoute, useEditorStore } from '../../stores/editorStore';
import { nodePlaceLabel, nodeTitle } from '../../utils/labels';
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
  const aliases = useEditorStore((s) => s.aliases);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
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
    <div className="editor-card">
      <section className="editor-card__section editor-card__section--first" aria-labelledby="route-points">
        <h2 id="route-points" className="editor-card__heading">
          Откуда и куда
        </h2>
        <label className="editor-check">
          <input type="checkbox" checked={routePickMode} onChange={(e) => setRoutePickMode(e.target.checked)} />
          <span className="editor-check__text">
            Выбирать точки щелчком по карте
            <span className="editor-check__hint">
              {!routePickMode
                ? 'выключено: щелчок выбирает узел, точки — поиском'
                : routePickTarget === 'from' || !route.fromNodeId
                  ? 'щёлкните узел — начало маршрута'
                  : 'щёлкните узел — конец маршрута'}
            </span>
          </span>
        </label>

        <RoutePointField
          label="Откуда"
          marker="start"
          query={fromQuery}
          chosen={route.fromNodeId}
          results={fromResults}
          onFocus={() => setRoutePickTarget('from')}
          onQuery={(value) => {
            setFromQuery(value);
            if (route.fromNodeId) setRouteSimulation({ fromNodeId: null });
          }}
          onPick={selectFrom}
          onClear={clearFrom}
        />
        <RoutePointField
          label="Куда"
          marker="finish"
          query={toQuery}
          chosen={route.toNodeId}
          results={toResults}
          onFocus={() => setRoutePickTarget('to')}
          onQuery={(value) => {
            setToQuery(value);
            if (route.toNodeId) setRouteSimulation({ toNodeId: null });
          }}
          onPick={selectTo}
          onClear={clearTo}
        />

        <div className="editor-card__actions">
          <button
            type="button"
            onClick={handleBuild}
            disabled={!route.fromNodeId || !route.toNodeId}
            className="editor-button editor-button--primary flex-1"
          >
            Построить
          </button>
          <button type="button" onClick={handleReset} className="editor-button editor-button--ghost" title="Сбросить маршрут и анимацию">
            Сброс
          </button>
        </div>
      </section>

      {route.active && (
        <>
          <section className="editor-card__section" aria-labelledby="route-result">
            <h2 id="route-result" className="editor-card__heading">
              Маршрут
            </h2>
            <dl className="editor-facts">
              <dt>Точек в маршруте</dt>
              <dd>{currentPath.length}</dd>
              {currentRoute && currentRoute.distanceMeters !== null && currentRoute.durationSeconds !== null && (
                <>
                  <dt>Длина</dt>
                  <dd>{Math.round(currentRoute.distanceMeters)} м</dd>
                  <dt>Время пешком</dt>
                  <dd>{formatRouteTime(currentRoute.durationSeconds)}</dd>
                </>
              )}
            </dl>
            {/* Длина и время — главная проверка привязки планов к метрике. */}
            {(!currentRoute || currentRoute.distanceMeters === null || currentRoute.durationSeconds === null) && (
              <p className="editor-section__hint">Длины и времени нет: планы не привязаны к метрике кампуса.</p>
            )}
            {pathInfo?.multiLevel && (
              <div className="editor-callout">
                Путь идёт через разные этажи или корпуса. Участки на других планах не видны; чтобы карта шла за
                меткой, включите «Вести карту за меткой».
              </div>
            )}

            {routes.length > 1 && (
              <div className="editor-card__actions" role="group" aria-label="Другие варианты маршрута">
                {routes.map((alternative, i) => (
                  <button
                    key={i}
                    type="button"
                    className="editor-chip"
                    aria-pressed={i === selectedPathIndex}
                    onClick={() => setRouteSelectedPath(i)}
                  >
                    Вариант {i + 1}: {alternative.path.length} точек
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="editor-card__section" aria-labelledby="route-marker">
            <h2 id="route-marker" className="editor-card__heading">
              Метка на карте
            </h2>
            <p className="editor-section__hint">
              Метка идёт по маршруту, пока открыта эта вкладка. С «вести карту» редактор сам открывает план, по
              которому она идёт сейчас; любое переключение плана вручную это выключает.
            </p>
            <div className="editor-card__actions">
              <button type="button" onClick={() => setRoutePlaying(!playing)} className="editor-button editor-button--accent">
                {playing ? 'Пауза' : 'Продолжить'}
              </button>
            </div>
            <label className="editor-check">
              <input type="checkbox" checked={follow} onChange={(event) => setRouteFollow(event.target.checked)} />
              <span className="editor-check__text">Вести карту за меткой</span>
            </label>
            <label className="editor-check">
              <span className="editor-check__text">
                Шаг метки
                <span className="editor-check__hint">{animationSpeed} мс на точку</span>
              </span>
              <input
                type="range"
                min={80}
                max={3000}
                step={20}
                value={animationSpeed}
                onChange={(e) => setRouteAnimationSpeed(Number.parseInt(e.target.value, 10))}
                aria-label="Шаг метки, миллисекунд на точку"
                className="editor-range"
              />
            </label>
          </section>

          <section className="editor-card__section" aria-labelledby="route-steps">
            <h2 id="route-steps" className="editor-card__heading">
              Точки маршрута
            </h2>
            <p className="editor-section__hint">Щелчок открывает план точки.</p>
            <ol className="editor-list">
              {currentPath.map((id, idx) => {
                const n = getNode(id);
                const isStart = idx === 0;
                const isEnd = idx === currentPath.length - 1;
                return (
                  <li key={`${id}-${idx}`} className="editor-list__row">
                    <button type="button" onClick={() => gotoNode(id)} className="editor-list__main" title={id}>
                      {/* Цвета старта и финиша — те же, что у точек маршрута на карте. */}
                      <span
                        aria-hidden="true"
                        className={`editor-route-dot${isStart ? ' editor-route-dot--start' : isEnd ? ' editor-route-dot--finish' : ''}`}
                      />
                      <span className="editor-list__text">
                        <span className="editor-list__name">
                          {idx + 1}. {nodeTitle(id, aliases)}
                        </span>
                        <span className="editor-list__sub">{n ? nodePlaceLabel(n, buildingMetas) : 'узла нет'}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        </>
      )}
    </div>
  );
};

/** Поле точки маршрута: поиск по названию и выбранная точка. */
const RoutePointField: React.FC<{
  label: string;
  marker: 'start' | 'finish';
  query: string;
  chosen: string | null;
  results: MapNode[];
  onFocus: () => void;
  onQuery: (value: string) => void;
  onPick: (nodeId: string) => void;
  onClear: () => void;
}> = ({ label, marker, query, chosen, results, onFocus, onQuery, onPick, onClear }) => {
  const aliases = useEditorStore((s) => s.aliases);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);

  return (
    <div className="editor-route-field">
      <div className="editor-route-field__label">
        <span aria-hidden="true" className={`editor-route-dot editor-route-dot--${marker}`} />
        <span>{label}</span>
      </div>
      <div className="editor-card__row">
        <input
          value={query}
          disabled={!!chosen}
          onFocus={onFocus}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Название или щелчок по узлу"
          aria-label={`${label}: название узла`}
          className="editor-input"
        />
        {chosen && (
          <button type="button" className="editor-icon-button" onClick={onClear} aria-label={`Сбросить: ${label.toLowerCase()}`}>
            <Icon name="close" />
          </button>
        )}
      </div>
      {!chosen && results.length > 0 && (
        <ul className="editor-list editor-route-field__results" aria-label={`${label}: найденные узлы`}>
          {results.map((n) => (
            <li key={n.id} className="editor-list__row">
              <button type="button" className="editor-list__main" onClick={() => onPick(n.id)}>
                <span className="editor-list__text">
                  <span className="editor-list__name">{nodeTitle(n.id, aliases)}</span>
                  <span className="editor-list__sub">{nodePlaceLabel(n, buildingMetas)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
