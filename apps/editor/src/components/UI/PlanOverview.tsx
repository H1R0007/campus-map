import React, { useDeferredValue, useMemo } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { floorNodesOf } from '../../stores/editor/dataSlice';
import { useValidationReport } from '../../hooks/useValidationReport';
import { planStats } from '../../utils/planStats';
import { plural } from '../../utils/labels';
import { Icon } from './Icon';

/**
 * Обзор открытого плана — вкладка «Свойства», когда ничего не выбрано.
 *
 * Отвечает на вопросы разметчика, не открывая отдельных панелей: сколько на
 * плане узлов, у скольких есть названия, нет ли узлов без связей и не
 * распался ли план на несвязанные части. Прежняя плавающая «Статистика»
 * смешивала цифры кампуса и этажа и закрывала кнопку «Маршрут».
 */
export const PlanOverview: React.FC = () => {
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

  const stats = useMemo(
    () => planStats(floorNodesOf(nodes, currentBuilding, currentFloor, showPortals), aliases, transitions),
    [nodes, currentBuilding, currentFloor, showPortals, aliases, transitions]
  );

  const title = currentBuilding
    ? `${buildingMetas.get(currentBuilding)?.name ?? currentBuilding}, этаж ${currentFloor}`
    : 'Территория кампуса';
  const problems = report.errors.length + report.warnings.length;

  return (
    <section aria-label="Обзор плана" className="editor-card">
      <header className="editor-card__header">
        <h2 className="editor-card__title">{title}</h2>
        <p className="editor-card__place">Щёлкните по узлу на карте — здесь появятся его названия, связи и переходы.</p>
      </header>

      <div className="editor-card__section">
        <dl className="editor-facts">
          <dt>Узлов</dt>
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
            <div className="editor-callout editor-callout--ok">Все узлы плана связаны между собой.</div>
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
            : `Проверка всей разметки: ошибок ${report.errors.length}, предупреждений ${report.warnings.length}`}
        </button>
      </div>
    </section>
  );
};
