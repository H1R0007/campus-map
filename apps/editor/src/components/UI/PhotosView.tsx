import React, { useMemo, useState } from 'react';
import { CAMPUS_BUILDING_ID } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';
import { nodePlaceLabel, nodeTitle } from '../../utils/labels';
import { sideLabel } from '../../utils/landmarkPassages';
import { photoCoverage } from '../../utils/photoCoverage';
import type { CoverageGroup } from '../../utils/photoCoverage';
import { InfoTip } from './Field';
import { Icon } from './Icon';

/** Сколько строк группы показывать сразу; остальные — по кнопке. */
const VISIBLE = 12;

/**
 * «Проверка → Фото» (запись 87): где не хватает фото и ориентиров. Это
 * подсказка, что снять на обходе, а не обязательная проверка: навигатор
 * работает и без фото. Щелчок по строке открывает точку в «Разметке», где у
 * неё раздел ориентира и фото.
 */
export const PhotosView: React.FC = () => {
  const nodes = useEditorStore((s) => s.nodes);
  const transitions = useEditorStore((s) => s.transitions);
  const aliases = useEditorStore((s) => s.aliases);
  const coverage = useMemo(() => photoCoverage(nodes, transitions, aliases), [nodes, transitions, aliases]);

  return (
    <div className="editor-card" data-photos-view>
      <section className="editor-card__section editor-card__section--first" aria-label="Что это">
        <p className="editor-section__hint">
          Что снять на обходе. Навигатор работает и без фото, поэтому в «Готовность карты» это не входит. Щелчок по строке
          открывает точку — там её ориентир и фото.
        </p>
      </section>
      <CoverageSection
        title="Входы без фото"
        info="Шаг «Дойдите до входа» покажет фото двери снаружи — так её узнают издалека."
        group={coverage.entrances}
        describe={(id) => `Вход: ${entranceName(id)}`}
      />
      <CoverageSection
        title="Развилки без ориентира"
        info="Точки, где сходятся три прохода и больше: там чаще всего сворачивают не туда. Ориентир даст шаг «У … поверните налево»."
        group={coverage.forks}
        describe={(id) => `Развилка у ${sideLabel(id, '', nodes, aliases)}`}
      />
      <CoverageSection
        title="Места без фото"
        info="Фото двери в карточке места помогает найти нужную дверь. Необязательно для каждой аудитории — начните с тех, что трудно найти."
        group={coverage.places}
        describe={(id) => nodeTitle(id, aliases)}
      />
    </div>
  );

  /** Вход называется корпусом, в который ведёт: «Корпус А», а у безымянной двери — id. */
  function entranceName(id: string): string {
    const transition = transitions.find((t) => t.type === 'entrance' && (t.fromNode === id || t.toNode === id));
    const inside = transition ? nodes.get(transition.fromNode === id ? transition.toNode : transition.fromNode) : undefined;
    const meta = inside ? useEditorStore.getState().buildingMetas.get(inside.building) : undefined;
    const name = aliases.get(id)?.[0] ?? (inside ? aliases.get(inside.id)?.[0] : undefined);
    return [meta?.name, name].filter(Boolean).join(' — ') || id;
  }
};

const CoverageSection: React.FC<{
  title: string;
  info: string;
  group: CoverageGroup;
  describe: (id: string) => string;
}> = ({ title, info, group, describe }) => {
  const nodes = useEditorStore((s) => s.nodes);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  const [all, setAll] = useState(false);
  const done = group.total - group.missing.length;
  const shown = all ? group.missing : group.missing.slice(0, VISIBLE);

  return (
    <section className="editor-card__section" aria-label={title} data-coverage={title}>
      <div className="editor-card__heading-row editor-coverage__head">
        <h3 className="editor-card__heading">{title}</h3>
        <InfoTip about={title}>{info}</InfoTip>
        <span className={`editor-coverage__count${group.missing.length === 0 ? ' editor-state--ok' : ''}`}>
          {group.total === 0 ? 'нет таких точек' : group.missing.length === 0 ? 'всё есть' : `готово ${done} из ${group.total}`}
        </span>
      </div>
      {shown.length > 0 && (
        <ul className="editor-list" aria-label={title}>
          {shown.map((id) => {
            const node = nodes.get(id);
            if (!node) return null;
            return (
              <li key={id} className="editor-list__row">
                <button type="button" className="editor-list__main" onClick={() => openPoint(id)} title={id} data-coverage-node={id}>
                  <span className="editor-list__text">
                    <span className="editor-list__name">{describe(id)}</span>
                    <span className="editor-list__sub">{nodePlaceLabel(node, buildingMetas)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!all && group.missing.length > VISIBLE && (
        <button type="button" className="editor-button editor-button--ghost" onClick={() => setAll(true)}>
          <Icon name="chevronDown" />
          Показать все {group.missing.length}
        </button>
      )}
    </section>
  );
};

/** Открывает точку в «Разметке»: её план, выбор и карточку с ориентиром и фото. */
function openPoint(id: string): void {
  const st = useEditorStore.getState();
  const node = st.nodes.get(id);
  if (!node) return;
  st.setWorkspace('markup');
  st.openPlan(node.building === CAMPUS_BUILDING_ID ? { building: null, floor: null } : { building: node.building, floor: node.floor });
  const now = useEditorStore.getState();
  now.clearSelection();
  now.addToSelection([id]);
  now.setCameraCenter(node.x, node.y);
}
