import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TRANSITION_TYPES, edgeKey, isNodeInScope, scopeOfFloor } from '@campus-map/core';
import type { TransitionType } from '@campus-map/core';
import { TransitionGlyph } from '@campus-map/mapkit';
import { useEditorStore } from '../../stores/editorStore';
import type { ContextMenuTarget, EditorStore } from '../../stores/editorStore';
import { TRANSITION_LABELS, nodePlaceLabel, nodeTitle } from '../../utils/labels';
import { Icon } from './Icon';
import type { IconName } from './Icon';

/** Пункт меню. */
interface MenuAction {
  kind: 'action';
  label: string;
  /** Клавиша, которой то же действие делается без меню. */
  shortcut?: string;
  icon?: IconName;
  glyph?: TransitionType;
  danger?: boolean;
  /** Отмеченный вариант из нескольких (тип перехода). */
  checked?: boolean;
  disabled?: boolean;
  run: () => void;
}

type MenuEntry = MenuAction | { kind: 'separator' } | { kind: 'heading'; label: string };

interface MenuContent {
  title: string;
  subtitle?: string;
  entries: MenuEntry[];
}

const separator: MenuEntry = { kind: 'separator' };

/** Отступ меню от края окна, пиксели. */
const EDGE_GAP = 8;

/**
 * Содержимое меню по цели. `null` — цель исчезла (узел удалён, пока меню
 * было открыто), меню закрывается.
 */
function contentOf(target: ContextMenuTarget, st: EditorStore): MenuContent | null {
  switch (target.kind) {
    case 'node': {
      const node = st.nodes.get(target.nodeId);
      if (!node) return null;
      const id = node.id;
      const named = (st.aliases.get(id)?.length ?? 0) > 0;
      return {
        title: nodeTitle(id, st.aliases),
        subtitle: named ? `${nodePlaceLabel(node, st.buildingMetas)} · ${id}` : nodePlaceLabel(node, st.buildingMetas),
        entries: [
          {
            kind: 'action',
            label: 'Соединить ребром с другим узлом',
            icon: 'link',
            run: () => {
              st.setActiveTool('edge');
              st.setEdgeStartNode(id);
            },
          },
          { kind: 'heading', label: 'Переход отсюда на другой этаж или в корпус' },
          ...TRANSITION_TYPES.map(
            (type): MenuEntry => ({
              kind: 'action',
              label: TRANSITION_LABELS[type],
              glyph: type,
              run: () => {
                st.setTransitionType(type);
                st.setActiveTool('transition');
                st.setTransitionStartNode(id);
              },
            })
          ),
          separator,
          {
            kind: 'action',
            label: node.isPortal ? 'Снять отметку «точка перехода»' : 'Отметить как точку перехода',
            icon: 'star',
            run: () => st.updateNode(id, { isPortal: !node.isPortal }),
          },
          {
            kind: 'action',
            label: 'Копировать',
            shortcut: 'Ctrl+C',
            icon: 'copy',
            run: () => {
              st.selectSingleNode(id);
              useEditorStore.getState().copySelected();
            },
          },
          {
            kind: 'action',
            label: 'Дублировать',
            shortcut: 'Ctrl+D',
            icon: 'duplicate',
            run: () => {
              st.selectSingleNode(id);
              useEditorStore.getState().duplicateSelected();
            },
          },
          separator,
          { kind: 'action', label: 'Удалить узел', shortcut: 'Delete', icon: 'trash', danger: true, run: () => st.removeNode(id) },
        ],
      };
    }

    case 'selection': {
      const count = target.nodeIds.filter((id) => st.nodes.has(id)).length;
      if (count === 0) return null;
      return {
        title: `Выбрано узлов: ${count}`,
        entries: [
          { kind: 'action', label: 'Соединить цепочкой', icon: 'link', run: () => st.connectSelectedChain() },
          { kind: 'action', label: 'Отметить как точки перехода', icon: 'star', run: () => st.setSelectedPortal(true) },
          { kind: 'action', label: 'Снять отметку «точка перехода»', icon: 'star', run: () => st.setSelectedPortal(false) },
          separator,
          { kind: 'action', label: 'Копировать', shortcut: 'Ctrl+C', icon: 'copy', run: () => st.copySelected() },
          { kind: 'action', label: 'Дублировать', shortcut: 'Ctrl+D', icon: 'duplicate', run: () => st.duplicateSelected() },
          separator,
          {
            kind: 'action',
            label: `Удалить узлы: ${count}`,
            shortcut: 'Delete',
            icon: 'trash',
            danger: true,
            run: () => st.deleteSelected(),
          },
        ],
      };
    }

    case 'edge': {
      const { from, to } = target;
      if (!st.nodes.get(from)?.neighbors.includes(to) && !st.nodes.get(to)?.neighbors.includes(from)) return null;
      return {
        title: 'Ребро',
        subtitle: `${nodeTitle(from, st.aliases)} — ${nodeTitle(to, st.aliases)}`,
        entries: [
          { kind: 'action', label: 'Вставить узел посередине', icon: 'plus', run: () => st.splitEdge(from, to) },
          {
            kind: 'action',
            label: 'Выделить оба конца',
            icon: 'select',
            run: () => useEditorStore.setState({ selectedNodeIds: new Set([from, to]) }),
          },
          separator,
          { kind: 'action', label: 'Удалить ребро', icon: 'trash', danger: true, run: () => st.removeEdge(from, to) },
        ],
      };
    }

    case 'transition': {
      const transition = st.transitions.find((t) => edgeKey(t.fromNode, t.toNode) === edgeKey(target.from, target.to));
      const a = transition && st.nodes.get(transition.fromNode);
      const b = transition && st.nodes.get(transition.toNode);
      if (!transition || !a || !b) return null;

      const scope = scopeOfFloor(st.currentBuilding, st.currentFloor);
      const aHere = isNodeInScope(a, scope);
      const bHere = isNodeInScope(b, scope);
      const other = aHere && !bHere ? b : !aHere && bHere ? a : null;

      return {
        title: TRANSITION_LABELS[transition.type],
        subtitle: `${nodeTitle(a.id, st.aliases)} (${nodePlaceLabel(a, st.buildingMetas)}) — ${nodeTitle(b.id, st.aliases)} (${nodePlaceLabel(b, st.buildingMetas)})`,
        entries: [
          { kind: 'heading', label: 'Тип перехода' },
          ...TRANSITION_TYPES.map(
            (type): MenuEntry => ({
              kind: 'action',
              label: TRANSITION_LABELS[type],
              glyph: type,
              checked: transition.type === type,
              run: () => st.updateTransitionType(a.id, b.id, type),
            })
          ),
          separator,
          other
            ? {
                kind: 'action',
                label: `Перейти к другому концу: ${nodePlaceLabel(other, st.buildingMetas)}`,
                icon: 'map',
                run: () => st.centerOnNode(other.id),
              }
            : {
                kind: 'action',
                label: 'Выделить оба конца',
                icon: 'select',
                run: () => useEditorStore.setState({ selectedNodeIds: new Set([a.id, b.id]) }),
              },
          separator,
          {
            kind: 'action',
            label: 'Удалить переход',
            icon: 'trash',
            danger: true,
            run: () => st.removeTransition(a.id, b.id),
          },
        ],
      };
    }

    case 'map': {
      const { x, y } = target;
      const clipboard = st.clipboard;
      return {
        title: 'Карта',
        subtitle: `Точка плана ${x}, ${y}`,
        entries: [
          { kind: 'action', label: 'Поставить узел здесь', icon: 'plus', run: () => st.addNode(x, y) },
          {
            kind: 'action',
            label: 'Вставить скопированное сюда',
            shortcut: 'Ctrl+V',
            icon: 'paste',
            disabled: !clipboard || clipboard.nodes.length === 0,
            run: () => {
              if (!clipboard || clipboard.nodes.length === 0) return;
              // Скопированное встаёт серединой в точку щелчка.
              const xs = clipboard.nodes.map((n) => n.x);
              const ys = clipboard.nodes.map((n) => n.y);
              const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
              const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
              st.paste(Math.round(x - cx), Math.round(y - cy));
            },
          },
          separator,
          { kind: 'action', label: 'Выделить все узлы плана', shortcut: 'Ctrl+A', icon: 'select', run: () => st.selectAll() },
          { kind: 'action', label: 'Показать план целиком', icon: 'map', run: () => st.requestFitPlan() },
        ],
      };
    }
  }
}

/**
 * Контекстное меню карты — одно на всё.
 *
 * Открывается правой кнопкой на узле, выделении, ребре, переходе или пустом
 * месте карты (`openContextMenu`). С клавиатуры: стрелки выбирают пункт,
 * Enter выполняет, Escape и Tab закрывают. Щелчок мимо меню закрывает его.
 */
export const ContextMenu: React.FC = () => {
  const menuRef = useRef<HTMLDivElement>(null);
  const contextMenu = useEditorStore((s) => s.contextMenu);
  const closeContextMenu = useEditorStore((s) => s.closeContextMenu);
  // Содержимое зависит от данных: подписка на стор целиком нужна, пока меню открыто.
  const state = useEditorStore((s) => (s.contextMenu.open ? s : null));
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const content = contextMenu.open && contextMenu.target && state ? contentOf(contextMenu.target, state) : null;
  const isOpen = content !== null;

  const close = useCallback(() => {
    closeContextMenu();
    // Фокус — обратно на карту, чтобы клавиши инструментов продолжали работать.
    document.querySelector<HTMLElement>('.leaflet-container')?.focus({ preventScroll: true });
  }, [closeContextMenu]);

  // Цель исчезла — меню закрывается.
  useEffect(() => {
    if (contextMenu.open && state && !content) closeContextMenu();
  }, [contextMenu.open, state, content, closeContextMenu]);

  // Меню целиком в окне: у правого и нижнего края оно открывается в другую сторону.
  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current) {
      setPosition(null);
      return;
    }
    const { width, height } = menuRef.current.getBoundingClientRect();
    let left = contextMenu.x;
    let top = contextMenu.y;
    if (left + width > window.innerWidth - EDGE_GAP) left = Math.max(EDGE_GAP, contextMenu.x - width);
    if (top + height > window.innerHeight - EDGE_GAP) top = Math.max(EDGE_GAP, window.innerHeight - EDGE_GAP - height);
    setPosition({ left, top });
  }, [isOpen, contextMenu.x, contextMenu.y, contextMenu.target]);

  // Фокус на первый пункт: меню сразу управляется с клавиатуры.
  useEffect(() => {
    if (!isOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role^="menuitem"]:not([disabled])')?.focus({ preventScroll: true });
  }, [isOpen, position, contextMenu.target]);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeContextMenu();
    };
    const onResize = () => closeContextMenu();

    document.addEventListener('mousedown', onPointerDown, true);
    window.addEventListener('resize', onResize);
    window.addEventListener('blur', onResize);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('blur', onResize);
    };
  }, [isOpen, closeContextMenu]);

  if (!content) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not([disabled])') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);

    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      items[e.key === 'Home' ? 0 : items.length - 1]?.focus();
    }
  };

  const run = (action: MenuAction) => {
    if (action.disabled) return;
    closeContextMenu();
    action.run();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={content.subtitle ? `${content.title}: ${content.subtitle}` : content.title}
      className="context-menu"
      // Меню появляется в точке нажатия, а сдвиг от края окна успевает
      // примениться до отрисовки (`useLayoutEffect`).
      style={position ?? { left: contextMenu.x, top: contextMenu.y }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="context-menu__header">
        <div className="context-menu__title">{content.title}</div>
        {content.subtitle && <div className="context-menu__subtitle">{content.subtitle}</div>}
      </div>

      {content.entries.map((entry, i) => {
        if (entry.kind === 'separator') return <div key={i} role="separator" className="context-menu__separator" />;
        if (entry.kind === 'heading') {
          return (
            <div key={i} className="context-menu__heading" aria-hidden="true">
              {entry.label}
            </div>
          );
        }
        const isRadio = entry.checked !== undefined;
        return (
          <button
            key={i}
            type="button"
            role={isRadio ? 'menuitemradio' : 'menuitem'}
            aria-checked={isRadio ? entry.checked : undefined}
            disabled={entry.disabled}
            className={`context-menu__item${entry.danger ? ' context-menu__item--danger' : ''}`}
            onClick={() => run(entry)}
          >
            <span className="context-menu__icon" aria-hidden="true">
              {entry.glyph ? (
                <TransitionGlyph type={entry.glyph} size={16} />
              ) : entry.icon ? (
                <Icon name={entry.icon} filled={entry.checked} />
              ) : null}
            </span>
            <span className="context-menu__label">{entry.label}</span>
            {isRadio && entry.checked && <Icon name="checkCircle" size={16} className="context-menu__check" />}
            {entry.shortcut && <kbd className="context-menu__shortcut">{entry.shortcut}</kbd>}
          </button>
        );
      })}
    </div>
  );
};
