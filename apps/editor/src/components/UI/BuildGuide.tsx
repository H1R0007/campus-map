import React, { useMemo } from 'react';
import { CAMPUS_BUILDING_ID, floorLabel } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';
import { useStructureChecks } from '../../hooks/useStructureChecks';
import { usePlaceBuilding } from '../../hooks/usePlaceBuilding';
import { useValidationReport } from '../../hooks/useValidationReport';
import { planScopeKey } from '../../utils/planFiles';
import { plural } from '../../utils/labels';
import { Icon } from './Icon';

/**
 * «Как собрать карту» — первое, что видно справа при открытии редактора
 * (запись 52).
 *
 * Пять шагов по порядку, у каждого — что уже сделано и кнопка, которая ведёт
 * к следующему действию. Отвечает на вопрос «а что дальше?», не заставляя
 * искать кнопки по панелям.
 */
export const BuildGuide: React.FC = () => {
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  const planFiles = useEditorStore((s) => s.planFiles);
  const nodes = useEditorStore((s) => s.nodes);
  const campusMpp = useEditorStore((s) => s.campusMeta?.metersPerPixel);
  const openImport = useEditorStore((s) => s.openImport);
  const startMeasuring = useEditorStore((s) => s.startMeasuring);
  const setCurrentBuilding = useEditorStore((s) => s.setCurrentBuilding);
  const setCurrentFloor = useEditorStore((s) => s.setCurrentFloor);
  const setInspectorTab = useEditorStore((s) => s.setInspectorTab);
  const requestSave = useEditorStore((s) => s.requestSave);
  const place = usePlaceBuilding();
  const structure = useStructureChecks();
  const report = useValidationReport();

  const facts = useMemo(() => {
    const floors = [...buildingMetas.values()].flatMap((meta) => meta.floors.map((floor) => ({ meta, floor: floor.floor })));
    const withoutPlan = floors.filter(({ meta, floor }) => !planFiles.has(planScopeKey(meta.id, floor)));
    const withPoints = new Set<string>();
    for (const node of nodes.values()) if (node.building !== CAMPUS_BUILDING_ID) withPoints.add(`${node.building}|${node.floor}`);
    const withoutPoints = floors.filter(({ meta, floor }) => !withPoints.has(`${meta.id}|${floor}`));
    const unplaced = [...buildingMetas.values()].filter((meta) => meta.floors.length > 0 && meta.placement?.originMeters === undefined);
    return { floors, withoutPlan, withoutPoints, unplaced };
  }, [buildingMetas, planFiles, nodes]);

  const buildings = buildingMetas.size;
  const problems = report.errors.length + report.warnings.length + structure.length;
  const firstWithoutPoints = facts.withoutPoints[0];

  const steps: { title: string; done: boolean; status: string; hint?: string; action?: { label: string; run: () => void } }[] = [
    {
      title: 'Планы корпусов',
      done: facts.floors.length > 0 && facts.withoutPlan.length === 0,
      status:
        facts.floors.length === 0
          ? 'Этажей пока нет'
          : `Корпусов ${buildings}, этажей ${facts.floors.length}` +
            (facts.withoutPlan.length > 0 ? `, без плана — ${facts.withoutPlan.length}` : ', у всех есть план'),
      hint: 'Перетащите файлы планов в любое место окна редактора: PDF, сканы, картинки, чертежи DXF, архивы ZIP. Корпуса и этажи появятся сами — редактор угадает их по имени файла и тексту на листе.',
      action: { label: 'Планы из файлов…', run: () => openImport() },
    },
    {
      title: 'Масштаб территории',
      done: campusMpp !== undefined,
      status: campusMpp === undefined ? 'Не задан' : `1 пикс. = ${String(Math.round(campusMpp * 10000) / 10000).replace('.', ',')} м`,
      hint: 'Два места на плане территории и расстояние между ними в метрах: без масштаба навигатор не покажет время в пути. Если у плана корпуса есть масштаб чертежа («1:200»), масштаб территории найдётся сам, когда поставите этот корпус.',
      action: { label: campusMpp === undefined ? 'Задать масштаб…' : 'Уточнить…', run: startMeasuring },
    },
    {
      title: 'Корпуса на территории',
      done: buildings > 0 && facts.unplaced.length === 0,
      status:
        facts.unplaced.length === 0
          ? buildings > 0
            ? 'Все стоят на своих местах'
            : 'Корпусов пока нет'
          : `Не поставлено: ${facts.unplaced.map((meta) => meta.name).join(', ')}`,
      hint: 'План корпуса ложится поверх территории — тяните и поворачивайте его за ручки или поставьте по парам точек.',
      action: facts.unplaced[0] ? { label: `Поставить «${facts.unplaced[0].name}»…`, run: () => place(facts.unplaced[0].id) } : undefined,
    },
    {
      title: 'Точки и связи',
      done: facts.floors.length > 0 && facts.withoutPoints.length === 0,
      status:
        facts.withoutPoints.length === 0
          ? facts.floors.length > 0
            ? 'На всех этажах есть точки'
            : '—'
          : `Без точек: ${facts.withoutPoints.length} ${plural(facts.withoutPoints.length, ['этаж', 'этажа', 'этажей'])}`,
      hint: 'Откройте этаж и ставьте точки инструментом «Узел» (N): вид точки выбирается в строке над картой, коридор — вид «Коридор».',
      action: firstWithoutPoints
        ? {
            label: `Открыть: ${firstWithoutPoints.meta.name}, этаж ${floorLabel(firstWithoutPoints.meta, firstWithoutPoints.floor)}`,
            run: () => {
              setCurrentBuilding(firstWithoutPoints.meta.id);
              setCurrentFloor(firstWithoutPoints.floor);
            },
          }
        : undefined,
    },
    {
      title: 'Проверка и сохранение',
      done: problems === 0,
      status: problems === 0 ? 'Замечаний нет' : `Замечаний: ${problems}`,
      hint: 'Проверка скажет, чего не хватит навигатору; «Сохранить» (Ctrl+S) запишет всё в data/.',
      action: problems > 0 ? { label: 'Открыть проверку', run: () => setInspectorTab('problems') } : { label: 'Сохранить', run: requestSave },
    },
  ];

  const next = steps.findIndex((step) => !step.done);

  return (
    <section aria-label="Как собрать карту" className="editor-card">
      <details className="editor-guide" open={next !== -1}>
        <summary className="editor-card__title">
          Как собрать карту
          {next === -1 ? ' — всё готово' : ` — шаг ${next + 1} из ${steps.length}`}
        </summary>
        <ol className="editor-guide__steps">
          {steps.map((step, index) => (
            <li key={step.title} className={index === next ? 'editor-guide__step editor-guide__step--next' : 'editor-guide__step'}>
              <span className={step.done ? 'editor-guide__mark editor-guide__mark--done' : 'editor-guide__mark'} aria-hidden="true">
                {step.done ? <Icon name="checkCircle" /> : index + 1}
              </span>
              <span className="editor-guide__body">
                <span className="editor-guide__title">{step.title}</span>
                <span className="editor-section__hint">{step.status}</span>
                {index === next && step.hint && <span className="editor-section__hint">{step.hint}</span>}
                {step.action && (index === next || !step.done) && (
                  <button
                    type="button"
                    className={index === next ? 'editor-button editor-button--primary' : 'editor-button editor-button--ghost'}
                    onClick={step.action.run}
                  >
                    {step.action.label}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
};
