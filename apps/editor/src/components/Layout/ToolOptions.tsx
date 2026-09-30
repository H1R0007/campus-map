import React from 'react';
import { TRANSITION_TYPES } from '@campus-map/core';
import type { TransitionType } from '@campus-map/core';
import { TRANSITION_COLORS, TransitionGlyph } from '@campus-map/mapkit';
import { useEditorStore } from '../../stores/editorStore';
import { TRANSITION_LABELS, nodesCount } from '../../utils/labels';
import { Icon } from '../UI/Icon';
import { TOOLS } from './tools';
import { KindPalette } from './KindPalette';

/** Короткие подписи типов на кнопках строки: инструмент уже называется «Переход». */
const CHIP_LABELS: Record<TransitionType, string> = {
  entrance: 'Вход',
  stairs: 'Лестница',
  lift: 'Лифт',
  bridge: 'Между корпусами',
};

/**
 * Строка над картой: выбранный инструмент и его параметры — вид точки, тип
 * перехода, число точек ряда, действия с выбранным. Что делает инструмент и
 * его клавиши — в строке состояния (запись 60).
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

const SelectOptions: React.FC = () => {
  const count = useEditorStore((s) => s.selectedNodeIds.size);
  const clipboard = useEditorStore((s) => s.clipboard);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected);
  const copySelected = useEditorStore((s) => s.copySelected);
  const paste = useEditorStore((s) => s.paste);
  const connectSelectedChain = useEditorStore((s) => s.connectSelectedChain);

  const pasteButton = clipboard && (
    <button type="button" className="editor-button editor-button--accent" onClick={() => paste()} title="Вставить (Ctrl+V)" aria-label="Вставить">
      <Icon name="paste" />
      <span className="editor-toolbar__label">Вставить</span>
    </button>
  );

  if (count === 0) {
    return (
      <>
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
              title="Соединить выбранные точки связями по порядку выбора"
              aria-label="Соединить цепочкой"
            >
              <Icon name="link" />
              <span className="editor-toolbar__label">Соединить цепочкой</span>
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

const NodeOptions: React.FC = () => <KindPalette />;

/** У «Связи» параметров нет: что делать, говорит строка состояния. */
const EdgeOptions: React.FC = () => null;

const TransitionOptions: React.FC = () => {
  const transitionType = useEditorStore((s) => s.transitionType);
  const setTransitionType = useEditorStore((s) => s.setTransitionType);

  return (
    <>
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

  return (
    <>
      {lineTool.start && (
        <div className="editor-toolbar__options" role="group" aria-label="Параметры ряда точек">
          <label className="editor-check">
            <span className="editor-check__text">Точек</span>
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
