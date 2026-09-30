import { floorLabel } from '@campus-map/core';
import React, { useDeferredValue, useMemo } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { floorNodesOf } from '../../stores/editor/dataSlice';
import { useValidationReport } from '../../hooks/useValidationReport';
import { useStructureChecks } from '../../hooks/useStructureChecks';
import { planStats } from '../../utils/planStats';
import { plural } from '../../utils/labels';
import { Icon } from './Icon';
import { BuildingSection, CampusPlanSection, DangerZone, FloorSection } from './StructureCards';

/**
 * Режим «Планы и корпуса» (запись 60): свойства того, что открыто в
 * структуре, — территории, корпуса или этажа (запись 47); у корпуса без
 * этажей — только корпус. Что делать дальше, говорит «Готовность карты»
 * внизу структуры (запись 67).
 */
export const StructureView: React.FC = () => {
  const currentBuilding = useEditorStore((s) => s.currentBuilding);
  const currentFloor = useEditorStore((s) => s.currentFloor);
  const building = useEditorStore((s) => (currentBuilding === null ? undefined : s.buildingMetas.get(currentBuilding)));
  const floor = currentFloor === null ? undefined : building?.floors.find((item) => item.floor === currentFloor);

  if (!building) {
    return (
      <section aria-label="Территория" className="editor-card">
        <header className="editor-card__header">
          <h2 className="editor-card__title">Территория</h2>
        </header>
        <CampusPlanSection />
      </section>
    );
  }

  return (
    <section aria-label={floor ? 'Этаж и корпус' : 'Корпус'} className="editor-card">
      <header className="editor-card__header">
        <h2 className="editor-card__title">{floor ? `Этаж ${floorLabel(building, floor.floor)}` : building.name}</h2>
        <p className="editor-card__place">{floor ? building.name : 'Этажей пока нет'}</p>
      </header>
      {floor && <FloorSection key={`${building.id}/${floor.floor}`} building={building} floor={floor} />}
      <BuildingSection key={building.id} building={building} />
      <DangerZone building={building} floor={floor} />
    </section>
  );
};

/**
 * Режим «Разметка» без выбранной точки: цифры открытого плана и итог
 * проверки — сколько точек, у скольких есть названия, не распался ли план.
 */
export const PlanStatsCard: React.FC = () => {
  const currentBuilding = useEditorStore((s) => s.currentBuilding);
  const currentFloor = useEditorStore((s) => s.currentFloor);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  const showPortals = useEditorStore((s) => s.displayFilters.showPortals);
  const setDisplayFilters = useEditorStore((s) => s.setDisplayFilters);
  const openCheck = useEditorStore((s) => s.openCheck);
  const nodes = useDeferredValue(useEditorStore((s) => s.nodes));
  const aliases = useEditorStore((s) => s.aliases);
  const transitions = useEditorStore((s) => s.transitions);
  const report = useValidationReport();
  const structure = useStructureChecks();

  const stats = useMemo(
    () => planStats(floorNodesOf(nodes, currentBuilding, currentFloor, showPortals), aliases, transitions),
    [nodes, currentBuilding, currentFloor, showPortals, aliases, transitions]
  );

  const title = currentBuilding
    ? `${buildingMetas.get(currentBuilding)?.name ?? currentBuilding}, этаж ${currentFloor === null ? '' : floorLabel(buildingMetas.get(currentBuilding), currentFloor)}`
    : 'Территория';
  const problems = report.errors.length + report.warnings.length + structure.length;

  return (
    <section aria-label="Обзор плана" className="editor-card">
      <header className="editor-card__header">
        <h2 className="editor-card__title">{title}</h2>
        <p className="editor-card__place">Выберите точку на карте, чтобы увидеть её свойства.</p>
      </header>

      <div className="editor-card__section">
        <dl className="editor-facts">
          <dt>Точек</dt>
          <dd>{stats.nodes}</dd>
          <dt>С названием</dt>
          <dd>{stats.named}</dd>
          <dt>Связей</dt>
          <dd>{stats.links}</dd>
          <dt>Переходов на другие планы</dt>
          <dd>{stats.transitions}</dd>
          <dt>Без связей</dt>
          <dd>{stats.isolated}</dd>
        </dl>

        {stats.nodes > 0 &&
          (stats.parts > 1 ? (
            <div className="editor-callout editor-callout--warn" role="status">
              План распался на {stats.parts} {plural(stats.parts, ['часть', 'части', 'частей'])}: по связям
              этого плана из одной в другую не пройти. Так бывает, если забыта связь, или если крылья соединены только через другой этаж.
              {stats.isolated > 0 && (
                <button
                  type="button"
                  className="editor-button editor-button--ghost mt-2"
                  onClick={() => setDisplayFilters({ highlightOrphans: true })}
                >
                  Подсветить точки без связей
                </button>
              )}
            </div>
          ) : (
            <div className="editor-callout editor-callout--ok">Все точки плана связаны между собой.</div>
          ))}
      </div>

      <div className="editor-card__section">
        <button
          type="button"
          className="editor-button editor-button--ghost editor-button--block"
          onClick={() => openCheck('problems')}
        >
          <Icon name={report.errors.length > 0 ? 'errorCircle' : problems > 0 ? 'warning' : 'checkCircle'} />
          {problems === 0
            ? 'Проверка всей разметки: замечаний нет'
            : `Проверка всей разметки: ошибок ${report.errors.length}, предупреждений ${report.warnings.length + structure.length}`}
        </button>
      </div>
    </section>
  );
};
