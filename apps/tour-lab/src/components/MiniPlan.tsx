import { CAMPUS_BUILDING_ID, campusMapUrl, floorMapUrl, planFormatOf } from '@campus-map/core';
import type { MapNode, Panorama } from '@campus-map/core';
import { planLabel, spotName } from '../tour/describe';
import { planBearing } from '../tour/frame';
import type { Tour } from '../tour/loadTour';
import type { PlanKey } from '../tour/plans';

interface MiniPlanProps {
  tour: Tour;
  panoramas: ReadonlyMap<string, Panorama>;
  plan: PlanKey;
  current: string | null;
  /** Куда смотрит человек, градусы территории. */
  viewYaw: number | null;
  routePath: readonly string[] | null;
  onSelect: (node: string) => void;
}

/** План этажа со снимками: точка — снимок, конус — куда смотрит человек. */
export function MiniPlan({ tour, panoramas, plan, current, viewYaw, routePath, onSelect }: MiniPlanProps) {
  const base = `${import.meta.env.BASE_URL}data`;
  const isCampus = plan.building === CAMPUS_BUILDING_ID;
  const floorMeta = tour.buildingMetas.get(plan.building)?.floors.find((entry) => entry.floor === plan.floor);
  const size = isCampus ? tour.dataset.campusMeta.mapSize : floorMeta?.mapSize;
  if (!size) return null;

  const url = isCampus
    ? campusMapUrl(base, planFormatOf(tour.dataset.campusMeta))
    : floorMapUrl(plan.building, plan.floor, base, planFormatOf(floorMeta));
  const nodes = tour.graph.getNodesForFloor(plan.building, plan.floor);
  const onPlan = (id: string) => {
    const node = tour.graph.getNode(id);
    return node && node.building === plan.building && node.floor === plan.floor ? node : null;
  };

  // Масштаб значков — от размера плана: план и значки масштабируются вместе.
  const unit = Math.max(size.width, size.height) / 110;
  const edges: [MapNode, MapNode][] = [];
  for (const node of nodes) {
    for (const id of node.neighbors) {
      const other = onPlan(id);
      if (other && node.id < other.id) edges.push([node, other]);
    }
  }

  const routeSegments: [MapNode, MapNode][] = [];
  for (let index = 1; routePath && index < routePath.length; index++) {
    const a = onPlan(routePath[index - 1]);
    const b = onPlan(routePath[index]);
    if (a && b) routeSegments.push([a, b]);
  }

  const currentNode = current ? onPlan(current) : null;
  const rotation = tour.planRotation(plan.building, plan.floor) ?? 0;
  let cone: string | null = null;
  if (currentNode && viewYaw !== null) {
    const direction = (planBearing(viewYaw, rotation) * Math.PI) / 180;
    const spread = (35 * Math.PI) / 180;
    const radius = unit * 7;
    const point = (angle: number) =>
      `${currentNode.x + radius * Math.sin(angle)},${currentNode.y - radius * Math.cos(angle)}`;
    cone = `M${currentNode.x},${currentNode.y} L${point(direction - spread)} A${radius},${radius} 0 0 1 ${point(direction + spread)} Z`;
  }

  return (
    <figure className="mini-plan">
      <figcaption>{planLabel(tour, plan)}</figcaption>
      <svg viewBox={`0 0 ${size.width} ${size.height}`} role="group" aria-label={`План: ${planLabel(tour, plan)}`}>
        <image href={url} width={size.width} height={size.height} />
        {edges.map(([a, b]) => (
          <line key={`${a.id}|${b.id}`} className="mini-plan__edge" x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={unit * 0.35} />
        ))}
        {routeSegments.map(([a, b]) => (
          <line key={`r${a.id}|${b.id}`} className="mini-plan__route" x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={unit * 0.9} />
        ))}
        {cone && <path className="mini-plan__cone" d={cone} />}
        {nodes
          .filter((node) => panoramas.has(node.id))
          .map((node) => {
            const name = spotName(tour, node.id);
            const isCurrent = node.id === current;
            return (
              <circle
                key={node.id}
                className={isCurrent ? 'mini-plan__spot mini-plan__spot--current' : 'mini-plan__spot'}
                cx={node.x}
                cy={node.y}
                r={unit * (isCurrent ? 1.9 : 1.5)}
                strokeWidth={unit * 0.45}
                role="button"
                tabIndex={0}
                aria-label={isCurrent ? `${name} — открыт` : `Открыть снимок: ${name}`}
                aria-current={isCurrent ? 'true' : undefined}
                data-node={node.id}
                onClick={() => onSelect(node.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(node.id);
                  }
                }}
              >
                <title>{name}</title>
              </circle>
            );
          })}
      </svg>
    </figure>
  );
}
