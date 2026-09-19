import React from 'react';
import { TransitionGlyph } from '@campus-map/mapkit';
import type { PlaceKind } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';
import { visibleKinds } from '../../utils/placeKinds';
import { Icon } from '../UI/Icon';
import type { IconName } from '../UI/Icon';

/** Сколько видов помещается в строку над картой; остальные — в окне «Все виды». */
export const PALETTE_SIZE = 8;

/** Значок вида: у видов с переходом — значок типа перехода, как на карте. */
export const KindGlyph: React.FC<{ kind: PlaceKind; size?: number }> = ({ kind, size = 16 }) => {
  if (kind.transition) return <TransitionGlyph type={kind.transition} size={size} />;
  return <Icon name={(kind.icon ?? 'pin') as IconName} size={size} />;
};

/**
 * Виды точек в строке над картой.
 *
 * Вид выбирается цифрой или щелчком и держится: дальше щелчки по карте
 * ставят точки этого вида подряд, рука не уходит к колонке инструментов.
 * Больше восьми видов в строку не влезает — остальные живут в окне «Все
 * виды», чтобы палитра не отнимала место у карты.
 */
export const KindPalette: React.FC = () => {
  const placeKinds = useEditorStore((s) => s.placeKinds);
  const activeKindId = useEditorStore((s) => s.activeKindId);
  const setActiveKind = useEditorStore((s) => s.setActiveKind);
  const setKindsOpen = useEditorStore((s) => s.setKindsOpen);

  const kinds = visibleKinds(placeKinds);
  const shown = kinds.slice(0, PALETTE_SIZE);
  const active = kinds.find((kind) => kind.id === activeKindId);
  const activeHidden = active !== undefined && !shown.includes(active);

  return (
    <div className="editor-toolbar__options" role="group" aria-label="Вид точки">
      {[...shown, ...(activeHidden ? [active] : [])].map((kind, index) => (
        <button
          key={kind.id}
          type="button"
          className="editor-chip"
          aria-pressed={activeKindId === kind.id}
          onClick={() => setActiveKind(kind.id)}
          title={index < PALETTE_SIZE ? `${kind.name} (${index + 1})` : kind.name}
        >
          <KindGlyph kind={kind} />
          <span className="editor-toolbar__label">{kind.name}</span>
        </button>
      ))}

      <button
        type="button"
        className="editor-button editor-button--ghost"
        onClick={() => setKindsOpen(true)}
        title="Все виды точек: создать свой, изменить, удалить"
      >
        <Icon name="sliders" />
        <span className="editor-toolbar__label">Все виды…</span>
      </button>
    </div>
  );
};
