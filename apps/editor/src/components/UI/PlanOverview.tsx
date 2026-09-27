import { floorLabel } from '@campus-map/core';
import React, { useDeferredValue, useMemo } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { floorNodesOf } from '../../stores/editor/dataSlice';
import { useValidationReport } from '../../hooks/useValidationReport';
import { useStructureChecks } from '../../hooks/useStructureChecks';
import { planStats } from '../../utils/planStats';
import { plural } from '../../utils/labels';
import { Icon } from './Icon';
import { BuildingSection, CampusPlanSection, FloorSection } from './StructureCards';
import { BuildGuide } from './BuildGuide';

/**
 * Обзор открытого плана — вкладка «Свойства», когда ничего не выбрано.
 *
 * Отвечает на вопросы разметчика, не открывая отдельных панелей: сколько на
 * плане узлов, у скольких есть названия, нет ли узлов без связей и не
 * распался ли план на несвязанные части. Прежняя плавающая «Статистика»
 * смешивала цифры кампуса и этажа и закрывала кнопку «Маршрут».
 *
 * Ниже — карточки этажа и корпуса: номер, подпись, названия, удаление
 * (запись 47). У корпуса без этажей — только они.
 */
export const PlanOverview: React.FC = () => {
  const currentBuilding = useEditorStore((s) => s.currentBuilding);
  const currentFloor = useEditorStore((s) => s.currentFloor);
  const building = useEditorStore((s) => (currentBuilding === null ? undefined : s.buildingMetas.get(currentBuilding)));
  const floor = currentFloor === null ? undefined : building?.floors.find((item) => item.floor === currentFloor);

  if (building && !floor) {
    return (
      <section aria-label="Обзор корпуса" className="editor-card">
        <header className="editor-card__header">
          <h2 className="editor-card__title">{building.name}</h2>
          <p className="editor-card__place">Этажей пока нет. Первый этаж добавляется на карте или кнопкой «Этаж» в структуре.</p>
        </header>
        <BuildingSection building={building} />
      </section>
    );
  }

  return (
    <>
      {!building && <BuildGuide />}
      <PlanStatsCard />
      {building && floor ? (
        <section aria-label="Этаж и корпус" className="editor-card">
          <FloorSection key={`${building.id}/${floor.floor}`} building={building} floor={floor} />
          <BuildingSection key={building.id} building={building} />
        </section>
      ) : (
        <section aria-label="Территория" className="editor-card">
          <CampusPlanSection />
        </section>
      )}
    </>
  );
};

/** Цифры открытого плана и итог проверки. */
const PlanStatsCard: React.FC = () => {
  const currentBuilding = useEditorStore((s) => s.currentBuilding);
  const currentFloor = useEditorStore((s) => s.currentFloor);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  const showPortals = useEditorStore((s) => s.displayFilters.showPortals);
  const setDisplayFilters = useEditorStore((s) => s.setDisplayFilters);
  const setInspectorTab = useEditorStore((s) => s.setInspectorTab);
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
                  Подсветить узлы без связей
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
          onClick={() => setInspectorTab('problems')}
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
