import React, { useEffect, useReducer, useRef } from 'react';
import { CAMPUS_BUILDING_ID } from '@campus-map/core';
import type { MapNode, TransitionType } from '@campus-map/core';
import { TRANSITION_COLORS } from '@campus-map/mapkit';
import { useEditorStore } from '../../stores/editorStore';
import type { EditorStore } from '../../stores/editorStore';
import { planOfGroup } from '../../stores/editor/windowSlice';
import { mapOfGroup, onMapsChange } from '../../utils/mapWindows';

interface Point {
  x: number;
  y: number;
}

interface Link {
  from: Point;
  to: Point;
  color: string;
  /** Переход строится: второй конец — курсор. */
  pending: boolean;
}

/** На какой карте виден план точки; активная — первой. */
function groupShowing(st: EditorStore, node: MapNode): number | null {
  const building = node.building === CAMPUS_BUILDING_ID ? null : node.building;
  const floor = building === null ? null : node.floor;
  const order = st.activeGroup === 0 ? [0, 1] : [1, 0];
  for (const group of order) {
    if (!st.mapGroups[group] || (group === 1 && st.sideCollapsed)) continue;
    const plan = planOfGroup(st, group);
    if (plan.building === building && plan.floor === floor) return group;
  }
  return null;
}

/** Точка плана на экране — относительно `origin`; `null`, если её карта её не показывает. */
function screenOf(group: number, node: MapNode, origin: DOMRect): Point | null {
  const map = mapOfGroup(group);
  if (!map) return null;
  const box = map.getContainer().getBoundingClientRect();
  const point = map.latLngToContainerPoint([node.y, node.x]);
  if (point.x < 0 || point.y < 0 || point.x > box.width || point.y > box.height) return null;
  return { x: box.left + point.x - origin.left, y: box.top + point.y - origin.top };
}

/**
 * Пунктир перехода между двумя картами (запись 66).
 *
 * - Переход строится: от первой точки к курсору, куда бы он ни ушёл — на
 *   соседнюю карту или на эту же.
 * - Выбрана точка перехода: пунктир к её концам, видным на соседней карте, —
 *   видно, какая лестница какой соответствует.
 *
 * Рисуется поверх обеих карт и не ловит нажатий.
 */
export const CrossMapLink: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const cursor = useRef<Point | null>(null);
  const [, redraw] = useReducer((n: number) => n + 1, 0);

  const split = useEditorStore((s) => s.mapGroups.length > 1 && !s.sideCollapsed);
  const startId = useEditorStore((s) => (s.activeTool === 'transition' ? s.transitionStartNodeId : null));
  const selectedId = useEditorStore((s) => (s.selectedNodeIds.size === 1 ? [...s.selectedNodeIds][0] : null));
  // Перерисовка при смене планов, данных и переходов — сами значения читаются ниже.
  useEditorStore((s) => s.mapGroups);
  useEditorStore((s) => s.currentBuilding);
  useEditorStore((s) => s.currentFloor);
  useEditorStore((s) => s.nodes);
  useEditorStore((s) => s.transitions);

  const watching = split && (startId !== null || selectedId !== null);

  // Карты двигаются и появляются — пунктир идёт за ними не чаще кадра.
  useEffect(() => {
    if (!watching) return;
    let frame: number | null = null;
    const schedule = () => {
      if (frame === null) {
        frame = requestAnimationFrame(() => {
          frame = null;
          redraw();
        });
      }
    };
    const attached = new Set<L.Map>();
    const attach = () => {
      for (const map of attached) map.off('move zoom resize', schedule);
      attached.clear();
      for (const group of [0, 1]) {
        const map = mapOfGroup(group);
        if (map) {
          map.on('move zoom resize', schedule);
          attached.add(map);
        }
      }
      schedule();
    };
    attach();
    const unsubscribe = onMapsChange(attach);

    const onPointerMove = (event: PointerEvent) => {
      const box = svgRef.current?.getBoundingClientRect();
      const inside =
        box && event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
      cursor.current = inside ? { x: event.clientX - box.left, y: event.clientY - box.top } : null;
      schedule();
    };
    window.addEventListener('pointermove', onPointerMove, true);

    return () => {
      unsubscribe();
      for (const map of attached) map.off('move zoom resize', schedule);
      window.removeEventListener('pointermove', onPointerMove, true);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [watching]);

  const links: Link[] = [];
  const origin = svgRef.current?.getBoundingClientRect();
  if (watching && origin) {
    const st = useEditorStore.getState();

    if (startId !== null) {
      const start = st.nodes.get(startId);
      const group = start ? groupShowing(st, start) : null;
      const from = start && group !== null ? screenOf(group, start, origin) : null;
      if (from && cursor.current) {
        links.push({ from, to: cursor.current, color: TRANSITION_COLORS[st.transitionType], pending: true });
      }
    } else if (selectedId !== null) {
      const node = st.nodes.get(selectedId);
      const group = node ? groupShowing(st, node) : null;
      const from = node && group !== null ? screenOf(group, node, origin) : null;
      if (node && from) {
        for (const transition of st.transitions) {
          const otherId =
            transition.fromNode === selectedId ? transition.toNode : transition.toNode === selectedId ? transition.fromNode : null;
          const other = otherId === null ? undefined : st.nodes.get(otherId);
          const otherGroup = other ? groupShowing(st, other) : null;
          if (!other || otherGroup === null || otherGroup === group) continue;
          const to = screenOf(otherGroup, other, origin);
          if (to) links.push({ from, to, color: TRANSITION_COLORS[transition.type as TransitionType], pending: false });
        }
      }
    }
  }

  return (
    <svg ref={svgRef} className="editor-crosslink" aria-hidden="true" data-links={links.length}>
      {links.map((link, index) => (
        <g key={index}>
          <line
            x1={link.from.x}
            y1={link.from.y}
            x2={link.to.x}
            y2={link.to.y}
            stroke={link.color}
            strokeWidth={2.5}
            strokeDasharray="7 5"
            strokeLinecap="round"
          />
          <circle cx={link.from.x} cy={link.from.y} r={5} fill="none" stroke={link.color} strokeWidth={2} />
          {!link.pending && <circle cx={link.to.x} cy={link.to.y} r={5} fill="none" stroke={link.color} strokeWidth={2} />}
        </g>
      ))}
    </svg>
  );
};
