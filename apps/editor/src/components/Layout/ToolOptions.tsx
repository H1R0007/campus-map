import React from 'react';
import { TRANSITION_TYPES } from '@campus-map/core';
import type { TransitionType } from '@campus-map/core';
import { TRANSITION_COLORS, TransitionGlyph } from '@campus-map/mapkit';
import { useEditorStore } from '../../stores/editorStore';
import { TRANSITION_LABELS, nodePlaceLabel, nodeTitle, nodesCount } from '../../utils/labels';
import { Icon } from '../UI/Icon';
import { TOOLS } from './tools';
import { KindPalette } from './KindPalette';
import { visibleKinds } from '../../utils/placeKinds';

/** Короткие подписи типов на кнопках строки: инструмент уже называется «Переход». */
const CHIP_LABELS: Record<TransitionType, string> = {
  entrance: 'Вход',
  stairs: 'Лестница',
  lift: 'Лифт',
  bridge: 'Между корпусами',
};

/**
 * Строка над картой: что делает выбранный инструмент, простыми словами, и
 * его параметры — тип перехода, число узлов линии, действия с выбранным.
 *
 * Строка закреплена и не меняет высоту карты при смене инструмента; раньше
 * параметры линии открывались плавающей панелью поверх плана и перехватывали
 * второй щелчок.
 */
export const ToolOptions: React.FC = () => {
  const activeTool = useEditorStore((s) => s.activeTool);
  const name = TOOLS.find((tool) => tool.id === activeTool)?.label ?? '';

  return (
    <div className="editor-toolbar" role="region" aria-label="Параметры инструмента" data-active-tool={activeTool}>
      <span className="editor-toolbar__tool" data-tool-name>
        {name}
      </span>
      {activeTool === 'select' && <SelectOptions />}
      {activeTool === 'node' && <NodeOptions />}
      {activeTool === 'edge' && <EdgeOptions />}
      {activeTool === 'transition' && <TransitionOptions />}
      {activeTool === 'line' && <LineOptions />}
    </div>
  );
};

const Hint: React.FC<{ text: string }> = ({ text }) => (
  <span className="editor-toolbar__hint" title={text}>
    {text}
  </span>
);

const SelectOptions: React.FC = () => {
  const count = useEditorStore((s) => s.selectedNodeIds.size);
  const clipboard = useEditorStore((s) => s.clipboard);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected);
  const copySelected = useEditorStore((s) => s.copySelected);
  const paste = useEditorStore((s) => s.paste);
  const connectSelectedChain = useEditorStore((s) => s.connectSelectedChain);
  const setSelectedPortal = useEditorStore((s) => s.setSelectedPortal);

  const pasteButton = clipboard && (
    <button type="button" className="editor-button editor-button--accent" onClick={() => paste()} title="Вставить (Ctrl+V)" aria-label="Вставить">
      <Icon name="paste" />
      <span className="editor-toolbar__label">Вставить</span>
    </button>
  );

  if (count === 0) {
    return (
      <>
        <Hint text="Щелчок — выбрать узел, перетаскивание — сдвинуть, Shift и протянуть — рамка, правая кнопка — меню." />
        {pasteButton && <div className="editor-toolbar__options">{pasteButton}</div>}
      </>
    );
  }

  return (
    <>
      <span className="editor-toolbar__hint">Выбрано: {nodesCount(count)}</span>
      <div className="editor-toolbar__options" role="group" aria-label="Действия с выбранным">
        {count > 1 && (
          <>
            <button
              type="button"
              className="editor-button editor-button--accent"
              onClick={connectSelectedChain}
              title="Соединить выбранные узлы связями по порядку выбора"
              aria-label="Соединить цепочкой"
            >
              <Icon name="link" />
              <span className="editor-toolbar__label">Соединить цепочкой</span>
            </button>
            <button
              type="button"
              className="editor-button editor-button--accent"
              onClick={() => setSelectedPortal(true)}
              title="Отметить выбранные как точки переходов: лестницы, лифты, входы"
              aria-label="Отметить как точки переходов"
            >
              <Icon name="star" />
              <span className="editor-toolbar__label">Точки переходов</span>
            </button>
          </>
        )}
        <button type="button" className="editor-button editor-button--accent" onClick={copySelected} title="Копировать (Ctrl+C)" aria-label="Копировать">
          <Icon name="copy" />
          <span className="editor-toolbar__label">Копировать</span>
        </button>
        {pasteButton}
        <button
          type="button"
          className="editor-button editor-button--accent"
          onClick={duplicateSelected}
          title="Дублировать (Ctrl+D)"
          aria-label="Дублировать"
        >
          <Icon name="duplicate" />
          <span className="editor-toolbar__label">Дублировать</span>
        </button>
        <button type="button" className="editor-button editor-button--danger" onClick={deleteSelected} title="Удалить (Delete)" aria-label="Удалить">
          <Icon name="trash" />
          <span className="editor-toolbar__label">Удалить</span>
        </button>
      </div>
    </>
  );
};

const NodeOptions: React.FC = () => {
  const placeKinds = useEditorStore((s) => s.placeKinds);
  const activeKindId = useEditorStore((s) => s.activeKindId);
  const chainLastNodeId = useEditorStore((s) => s.chainLastNodeId);
  const kind = visibleKinds(placeKinds).find((item) => item.id === activeKindId);

  const hint = !kind
    ? 'Щелчок по карте ставит точку. Выберите вид точки.'
    : kind.chain
      ? chainLastNodeId
        ? `Ведём линию «${kind.name}»: каждый щелчок — точка и связь с предыдущей. Enter или Esc — закончить.`
        : `Щелчки ведут линию «${kind.name}»: каждая точка соединяется с предыдущей. Вид меняется цифрой.`
      : `Щелчок по карте ставит точку вида «${kind.name}». Shift — связать с предыдущей, Alt — без выравнивания. Вид меняется цифрой.`;

  return (
    <>
      <Hint text={hint} />
      <KindPalette />
    </>
  );
};

const EdgeOptions: React.FC = () => {
  const edgeStartNodeId = useEditorStore((s) => s.edgeStartNodeId);
  const aliases = useEditorStore((s) => s.aliases);
  return (
    <Hint
      text={
        edgeStartNodeId
          ? `Щелчок по второму узлу соединит его с «${nodeTitle(edgeStartNodeId, aliases)}». Esc — отмена.`
          : 'Щелчок по первому узлу, затем по второму — между ними появится связь.'
      }
    />
  );
};

const TransitionOptions: React.FC = () => {
  const transitionType = useEditorStore((s) => s.transitionType);
  const setTransitionType = useEditorStore((s) => s.setTransitionType);
  const startId = useEditorStore((s) => s.transitionStartNodeId);
  const start = useEditorStore((s) => (startId ? s.nodes.get(startId) : undefined));
  const aliases = useEditorStore((s) => s.aliases);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);

  // Начатый переход переживает смену этажа, поэтому подсказка называет, от
  // какого узла и с какого плана он строится.
  const hint = start
    ? `${TRANSITION_LABELS[transitionType]} от «${nodeTitle(start.id, aliases)}» (${nodePlaceLabel(start, buildingMetas)}): откройте другой этаж и щёлкните второй узел. Esc — отмена.`
    : 'Щелчок по первому узлу, смена этажа, щелчок по второму.';

  return (
    <>
      <Hint text={hint} />
      <div className="editor-toolbar__options" role="group" aria-label="Тип перехода">
        {TRANSITION_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className="editor-chip"
            aria-pressed={transitionType === type}
            onClick={() => setTransitionType(type)}
            title={TRANSITION_LABELS[type]}
            aria-label={TRANSITION_LABELS[type]}
            style={{ '--chip': TRANSITION_COLORS[type] } as React.CSSProperties}
          >
            <TransitionGlyph type={type} size={16} />
            <span className="editor-toolbar__label">{CHIP_LABELS[type]}</span>
          </button>
        ))}
      </div>
    </>
  );
};

const LineOptions: React.FC = () => {
  const lineTool = useEditorStore((s) => s.lineTool);
  const lineSetCount = useEditorStore((s) => s.lineSetCount);
  const lineSetAutoConnect = useEditorStore((s) => s.lineSetAutoConnect);
  const lineConfirm = useEditorStore((s) => s.lineConfirm);
  const lineReset = useEditorStore((s) => s.lineReset);

  const hint = !lineTool.start
    ? 'Щелчок по карте — начало линии.'
    : !lineTool.end
      ? 'Щелчок по карте — конец линии.'
      : 'Узлы встанут на линию на равном расстоянии.';

  return (
    <>
      <Hint text={hint} />
      {lineTool.start && (
        <div className="editor-toolbar__options" role="group" aria-label="Параметры линии">
          <label className="editor-check">
            <span className="editor-check__text">Узлов</span>
            <input
              type="number"
              min={2}
              max={50}
              value={lineTool.count}
              onChange={(e) => {
                const value = Number.parseInt(e.target.value, 10);
                if (Number.isFinite(value)) lineSetCount(value);
              }}
              className="editor-input editor-input--narrow"
            />
          </label>
          <label className="editor-check">
            <input type="checkbox" checked={lineTool.autoConnect} onChange={(e) => lineSetAutoConnect(e.target.checked)} />
            <span className="editor-check__text">Цепочкой</span>
          </label>
          <button
            type="button"
            className="editor-button editor-button--primary"
            disabled={!lineTool.end}
            onClick={() => lineConfirm()}
          >
            Создать
          </button>
          <button type="button" className="editor-button editor-button--ghost" onClick={() => lineReset()}>
            Сбросить
          </button>
        </div>
      )}
    </>
  );
};
