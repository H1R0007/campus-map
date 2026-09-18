import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CAMPUS_BUILDING_ID, TRANSITION_TYPES, distance } from '@campus-map/core';
import { TRANSITION_COLORS, TransitionGlyph } from '@campus-map/mapkit';
import type { TransitionType } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';
import { floorNodesOf } from '../../stores/editor/dataSlice';
import { Icon } from './Icon';
import { PlanOverview } from './PlanOverview';
import { TRANSITION_LABELS, nodePlaceLabel, nodeTitle, nodesCount } from '../../utils/labels';

/** Сколько ближайших узлов предлагать для быстрого соединения. */
const CONNECT_CANDIDATES = 6;

/** Пустой список названий одной ссылкой: новая ссылка обновляла бы карточку зря. */
const NO_ALIASES: string[] = [];

/**
 * Вкладка «Свойства» инспектора: карточка выбранного узла, сводка по
 * нескольким выбранным, а без выбора — обзор открытого плана.
 */
export const PropertiesView: React.FC = () => {
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);
  const aliases = useEditorStore((s) => s.aliases);
  const selectSingleNode = useEditorStore((s) => s.selectSingleNode);
  const clearSelection = useEditorStore((s) => s.clearSelection);

  const selectedIds = Array.from(selectedNodeIds);

  if (selectedIds.length === 1) {
    return <NodeCard key={selectedIds[0]} nodeId={selectedIds[0]} onClose={clearSelection} />;
  }

  if (selectedIds.length > 1) {
    return (
      <div className="editor-card">
        <header className="editor-card__header">
          <h2 className="editor-card__title">Выбрано: {nodesCount(selectedIds.length)}</h2>
          <p className="editor-card__place">
            Действия с ними — в строке над картой и в меню правой кнопки; стрелки сдвигают все сразу.
          </p>
        </header>
        <section className="editor-card__section" aria-label="Выбранные узлы">
          <ul className="editor-list">
            {selectedIds.slice(0, 30).map((id) => (
              <li key={id} className="editor-list__row">
                <button type="button" className="editor-list__main" onClick={() => selectSingleNode(id)} title={id}>
                  <span className="editor-list__name">{nodeTitle(id, aliases)}</span>
                </button>
              </li>
            ))}
          </ul>
          {selectedIds.length > 30 && <p className="editor-section__hint">…и ещё {selectedIds.length - 30}</p>}
        </section>
      </div>
    );
  }

  return <PlanOverview />;
};

/**
 * Карточка выбранного узла.
 *
 * Сначала — названия: ради них разметчик и открывает карточку. Положение и
 * id — в свёрнутом «Служебном», они нужны редко.
 *
 * Названия, связи и переходы читаются из стора подпиской, а не снимком в
 * момент выбора узла: посчитанный один раз список устаревал после первой же
 * правки, и следующее действие в карточке шло по нему — добавленное
 * название молча исчезало.
 */
const NodeCard: React.FC<{ nodeId: string; onClose: () => void }> = ({ nodeId, onClose }) => {
  const node = useEditorStore((s) => s.nodes.get(nodeId));
  const allAliases = useEditorStore((s) => s.aliases);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  const removeNode = useEditorStore((s) => s.removeNode);
  const updateNode = useEditorStore((s) => s.updateNode);

  const aliases = allAliases.get(nodeId) ?? NO_ALIASES;

  if (!node) return null;

  return (
    <section aria-label="Свойства узла" data-node-id={node.id} className="editor-card">
      <header className="editor-card__header">
        <h2 className={`editor-card__title${aliases.length === 0 ? ' editor-card__title--empty' : ''}`}>
          {aliases[0] ?? 'Без названия'}
        </h2>
        <p className="editor-card__place">
          {nodePlaceLabel(node, buildingMetas)}
          {node.isPortal && ' · точка перехода'}
        </p>
      </header>

      <NamesSection nodeId={nodeId} aliases={aliases} />
      <LinksSection nodeId={nodeId} />
      <TransitionsSection nodeId={nodeId} />

      <section className="editor-card__section" aria-labelledby="card-kind">
        <h3 id="card-kind" className="editor-card__heading">
          Вид точки
        </h3>
        <label className="editor-check">
          <input
            type="checkbox"
            checked={node.isPortal}
            onChange={(e) => updateNode(node.id, { isPortal: e.target.checked })}
          />
          <span className="editor-check__text">
            Точка перехода
            <span className="editor-check__hint">лестница, лифт или вход — навигатор рисует её значком</span>
          </span>
        </label>
      </section>

      <CommentSection nodeId={nodeId} />
      <ServiceSection nodeId={nodeId} />

      <footer className="editor-card__footer">
        <button
          type="button"
          className="editor-button editor-button--danger flex-1"
          onClick={() => {
            removeNode(node.id);
            onClose();
          }}
        >
          <Icon name="trash" />
          Удалить узел
        </button>
        <button type="button" className="editor-button editor-button--ghost" onClick={onClose} title="Снять выбор (Esc)">
          Снять выбор
        </button>
      </footer>
    </section>
  );
};

/** Названия узла: первое — главное, остальные — как ещё ищут это место. */
const NamesSection: React.FC<{ nodeId: string; aliases: string[] }> = ({ nodeId, aliases }) => {
  const setNodeAliases = useEditorStore((s) => s.setNodeAliases);
  const nameEditNodeId = useEditorStore((s) => s.nameEditNodeId);
  const clearNameEdit = useEditorStore((s) => s.clearNameEdit);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [newName, setNewName] = useState('');
  const editRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingIndex !== null) {
      editRef.current?.focus();
      editRef.current?.select();
    }
  }, [editingIndex]);

  // Двойной щелчок по узлу на карте: сразу к названию — правка первого или
  // ввод нового, если названий нет.
  useEffect(() => {
    if (nameEditNodeId !== nodeId) return;
    clearNameEdit();
    if (aliases.length > 0) {
      setEditingIndex(0);
      setEditingValue(aliases[0]);
    } else {
      newRef.current?.focus();
    }
    // Реагируем только на просьбу, а не на каждую правку названий.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameEditNodeId, nodeId]);

  const saveEdit = () => {
    if (editingIndex === null) return;
    const value = editingValue.trim();
    if (value && value !== aliases[editingIndex]) {
      const next = [...aliases];
      next[editingIndex] = value;
      setNodeAliases(nodeId, next);
    }
    setEditingIndex(null);
  };

  const addName = () => {
    const value = newName.trim();
    if (!value || aliases.includes(value)) return;
    setNodeAliases(nodeId, [...aliases, value]);
    setNewName('');
  };

  return (
    <section className="editor-card__section" aria-labelledby="card-names">
      <h3 id="card-names" className="editor-card__heading">
        Названия ({aliases.length})
      </h3>
      <p className="editor-section__hint">
        Первое — главное: его видно на карте и в поиске. Остальные — как ещё ищут это место.
      </p>

      <ul className="editor-list">
        {aliases.map((alias, index) => (
          <li key={`${alias}-${index}`} className="editor-list__row">
            {editingIndex === index ? (
              <input
                ref={editRef}
                value={editingValue}
                aria-label={`Название ${index + 1}`}
                onChange={(e) => setEditingValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit();
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setEditingIndex(null);
                  }
                }}
                className="editor-input"
              />
            ) : (
              <button
                type="button"
                className="editor-list__main"
                onClick={() => {
                  setEditingIndex(index);
                  setEditingValue(alias);
                }}
                title="Изменить название"
              >
                <span className="editor-list__name">{alias}</span>
              </button>
            )}
            <button
              type="button"
              className="editor-icon-button editor-list__remove"
              onClick={() => setNodeAliases(nodeId, aliases.filter((_, i) => i !== index))}
              aria-label={`Удалить название «${alias}»`}
              title="Удалить название"
            >
              <Icon name="close" />
            </button>
          </li>
        ))}
      </ul>

      <div className="editor-card__row">
        <input
          ref={newRef}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addName();
          }}
          placeholder={aliases.length === 0 ? 'Например: А-101' : 'Ещё одно название'}
          aria-label="Новое название"
          className="editor-input"
        />
        <button
          type="button"
          onClick={addName}
          disabled={!newName.trim()}
          className="editor-button editor-button--primary"
        >
          Добавить
        </button>
      </div>
    </section>
  );
};

/** Связи узла на его плане и быстрое соединение с ближайшими. */
const LinksSection: React.FC<{ nodeId: string }> = ({ nodeId }) => {
  const node = useEditorStore((s) => s.nodes.get(nodeId));
  const allNodes = useEditorStore((s) => s.nodes);
  const allAliases = useEditorStore((s) => s.aliases);
  const showPortals = useEditorStore((s) => s.displayFilters.showPortals);
  const addEdge = useEditorStore((s) => s.addEdge);
  const removeEdge = useEditorStore((s) => s.removeEdge);
  const selectSingleNode = useEditorStore((s) => s.selectSingleNode);
  const setHoveredNode = useEditorStore((s) => s.setHoveredNode);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const setEdgeStartNode = useEditorStore((s) => s.setEdgeStartNode);
  const [showNearest, setShowNearest] = useState(false);

  // Ближайшие узлы плана, с которыми узел ещё не соединён: соединяют обычно с
  // соседом по коридору, а не с первым попавшимся по порядку в файле.
  const nearest = useMemo(() => {
    if (!node || !showNearest) return [];
    const onCampus = node.building === CAMPUS_BUILDING_ID;
    return floorNodesOf(allNodes, onCampus ? null : node.building, onCampus ? null : node.floor, showPortals)
      .filter((n) => n.id !== nodeId && !node.neighbors.includes(n.id))
      .map((n) => ({ node: n, away: Math.round(distance(node, n)) }))
      .sort((a, b) => a.away - b.away)
      .slice(0, CONNECT_CANDIDATES);
  }, [allNodes, node, nodeId, showPortals, showNearest]);

  if (!node) return null;

  return (
    <section className="editor-card__section" aria-labelledby="card-links">
      <h3 id="card-links" className="editor-card__heading">
        Связи ({node.neighbors.length})
      </h3>
      {node.neighbors.length === 0 && (
        <p className="editor-section__hint">Узел ни с чем не связан: маршрут к нему не построится.</p>
      )}
      <ul className="editor-list">
        {node.neighbors.map((id) => (
          <li
            key={id}
            className="editor-list__row"
            onMouseEnter={() => setHoveredNode(id)}
            onMouseLeave={() => setHoveredNode(null)}
          >
            <button type="button" className="editor-list__main" onClick={() => selectSingleNode(id)} title={id}>
              <span className="editor-list__name">{nodeTitle(id, allAliases)}</span>
            </button>
            <button
              type="button"
              className="editor-icon-button editor-list__remove"
              onClick={() => removeEdge(node.id, id)}
              aria-label={`Удалить связь с «${nodeTitle(id, allAliases)}»`}
              title="Удалить связь"
            >
              <Icon name="close" />
            </button>
          </li>
        ))}
      </ul>

      <div className="editor-card__actions">
        <button
          type="button"
          className="editor-button editor-button--accent"
          aria-expanded={showNearest}
          onClick={() => setShowNearest(!showNearest)}
        >
          <Icon name="zap" />
          Соединить с ближайшим
        </button>
        <button
          type="button"
          className="editor-button editor-button--ghost"
          onClick={() => {
            setActiveTool('edge');
            setEdgeStartNode(nodeId);
          }}
          title="Инструмент «Связь» от этого узла: щёлкните второй узел на карте"
        >
          <Icon name="link" />
          Связь отсюда
        </button>
      </div>

      {showNearest && (
        <ul className="editor-list mt-2" aria-label="Ближайшие несвязанные узлы">
          {nearest.length === 0 && <li className="editor-section__hint">На плане нет узлов без связи с этим.</li>}
          {nearest.map(({ node: candidate, away }) => (
            <li
              key={candidate.id}
              className="editor-list__row"
              onMouseEnter={() => setHoveredNode(candidate.id)}
              onMouseLeave={() => setHoveredNode(null)}
            >
              <button
                type="button"
                className="editor-list__main"
                onClick={() => {
                  addEdge(node.id, candidate.id);
                  setShowNearest(false);
                }}
                title={`Соединить с ${candidate.id}`}
              >
                <span className="editor-list__text">
                  <span className="editor-list__name">{nodeTitle(candidate.id, allAliases)}</span>
                  <span className="editor-list__sub">в {away} пикс. плана</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

/** Переходы узла на другие планы и начало нового перехода. */
const TransitionsSection: React.FC<{ nodeId: string }> = ({ nodeId }) => {
  const allTransitions = useEditorStore((s) => s.transitions);
  const allNodes = useEditorStore((s) => s.nodes);
  const allAliases = useEditorStore((s) => s.aliases);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  const removeTransition = useEditorStore((s) => s.removeTransition);
  const centerOnNode = useEditorStore((s) => s.centerOnNode);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const setTransitionStartNode = useEditorStore((s) => s.setTransitionStartNode);
  const setTransitionType = useEditorStore((s) => s.setTransitionType);
  const [picking, setPicking] = useState(false);

  const transitions = useMemo(
    () => allTransitions.filter((t) => t.fromNode === nodeId || t.toNode === nodeId),
    [allTransitions, nodeId]
  );

  const startTransition = (type: TransitionType) => {
    setTransitionType(type);
    setActiveTool('transition');
    setTransitionStartNode(nodeId);
    setPicking(false);
  };

  return (
    <section className="editor-card__section" aria-labelledby="card-transitions">
      <h3 id="card-transitions" className="editor-card__heading">
        Переходы ({transitions.length})
      </h3>
      <ul className="editor-list">
        {transitions.map((t) => {
          const otherId = t.fromNode === nodeId ? t.toNode : t.fromNode;
          const other = allNodes.get(otherId);
          return (
            <li key={`${t.fromNode}|${t.toNode}|${t.type}`} className="editor-list__row">
              <button
                type="button"
                className="editor-list__main"
                onClick={() => centerOnNode(otherId)}
                title={`Показать другой конец: ${otherId}`}
              >
                <span
                  className="editor-list__glyph"
                  style={{ backgroundColor: TRANSITION_COLORS[t.type] }}
                  title={TRANSITION_LABELS[t.type]}
                >
                  <TransitionGlyph type={t.type} size={16} />
                </span>
                <span className="editor-list__text">
                  <span className="editor-list__name">{nodeTitle(otherId, allAliases)}</span>
                  <span className="editor-list__sub">
                    {TRANSITION_LABELS[t.type]} · {other ? nodePlaceLabel(other, buildingMetas) : 'узла нет'}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="editor-icon-button editor-list__remove"
                onClick={() => removeTransition(t.fromNode, t.toNode)}
                aria-label={`Удалить переход: ${TRANSITION_LABELS[t.type]} к «${nodeTitle(otherId, allAliases)}»`}
                title="Удалить переход"
              >
                <Icon name="close" />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="editor-card__actions">
        <button
          type="button"
          className="editor-button editor-button--ghost"
          aria-expanded={picking}
          onClick={() => setPicking(!picking)}
        >
          <Icon name="transition" />
          Переход отсюда…
        </button>
      </div>
      {picking && (
        <div className="editor-card__actions" role="group" aria-label="Тип нового перехода">
          {TRANSITION_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className="editor-chip"
              style={{ '--chip': TRANSITION_COLORS[type] } as React.CSSProperties}
              onClick={() => startTransition(type)}
            >
              <TransitionGlyph type={type} size={16} />
              {TRANSITION_LABELS[type]}
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

/** Рабочая заметка разметчика: не видна студентам, не влияет на маршруты. */
const CommentSection: React.FC<{ nodeId: string }> = ({ nodeId }) => {
  const comment = useEditorStore((s) => s.nodes.get(nodeId)?.comment ?? '');
  const setNodeComment = useEditorStore((s) => s.setNodeComment);

  // Черновик заметки: правка уходит в стор (и в историю отмены) только по
  // завершению, а не на каждое нажатие клавиши.
  const [draft, setDraft] = useState(comment);
  const focused = useRef(false);

  // Значение изменилось извне (отмена или повтор действия) — подхватываем,
  // но только пока человек не печатает.
  useEffect(() => {
    if (!focused.current) setDraft(comment);
  }, [comment]);

  const commit = useCallback(() => {
    focused.current = false;
    if (draft !== comment) setNodeComment(nodeId, draft);
  }, [comment, draft, nodeId, setNodeComment]);

  return (
    <section className="editor-card__section" aria-labelledby="card-comment">
      <h3 id="card-comment" className="editor-card__heading">
        Заметка разметчика
      </h3>
      <textarea
        value={draft}
        rows={3}
        aria-labelledby="card-comment"
        placeholder="Например: геометрия приблизительная, уточнить у коменданта"
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            commit();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            focused.current = false;
            setDraft(comment);
            e.currentTarget.blur();
          }
        }}
        className="editor-textarea"
      />
      <p className="editor-section__hint">
        Видна только команде разметки и на маршруты не влияет. Сохраняется, когда поле теряет фокус; Esc отменяет.
      </p>
    </section>
  );
};

/** Положение и id — нужны редко, поэтому свёрнуты. */
const ServiceSection: React.FC<{ nodeId: string }> = ({ nodeId }) => {
  const nodeX = useEditorStore((s) => s.nodes.get(nodeId)?.x);
  const nodeY = useEditorStore((s) => s.nodes.get(nodeId)?.y);
  const updateNode = useEditorStore((s) => s.updateNode);
  const [xText, setXText] = useState('');
  const [yText, setYText] = useState('');

  // Координаты читаются как примитивы: иначе эффект перезапускался бы на
  // любое изменение узла и сбрасывал несохранённый ввод.
  useEffect(() => {
    if (nodeX === undefined || nodeY === undefined) return;
    setXText(String(nodeX));
    setYText(String(nodeY));
  }, [nodeX, nodeY]);

  if (nodeX === undefined || nodeY === undefined) return null;

  const commit = () => {
    const x = Number.isFinite(Number(xText)) ? Math.round(Number(xText)) : nodeX;
    const y = Number.isFinite(Number(yText)) ? Math.round(Number(yText)) : nodeY;
    if (x !== nodeX || y !== nodeY) updateNode(nodeId, { x, y });
  };

  return (
    <details className="editor-card__details">
      <summary>Служебное: положение и id</summary>
      <p className="editor-section__hint">
        id: <span className="editor-card__id">{nodeId}</span>
      </p>
      <div className="editor-card__row">
        <label className="flex-1">
          <span className="editor-section__hint">X, пикс. плана</span>
          <input
            aria-label="Координата X"
            value={xText}
            inputMode="numeric"
            onChange={(e) => setXText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            className="editor-input"
          />
        </label>
        <label className="flex-1">
          <span className="editor-section__hint">Y, пикс. плана</span>
          <input
            aria-label="Координата Y"
            value={yText}
            inputMode="numeric"
            onChange={(e) => setYText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            className="editor-input"
          />
        </label>
      </div>
    </details>
  );
};
