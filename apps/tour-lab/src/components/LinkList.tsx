import type { PanoramaLink } from '@campus-map/core';
import { distanceText, linkLabel, sideOf } from '../tour/describe';
import { worldBearing } from '../tour/frame';
import type { Tour } from '../tour/loadTour';

interface LinkListProps {
  tour: Tour;
  current: string;
  links: readonly PanoramaLink[];
  viewYaw: number | null;
  routeNext: string | null;
  /** Перейти по стрелке; `yaw` — куда смотреть по приходу, градусы территории. */
  onGo: (target: string, yaw: number | null) => void;
}

/**
 * «Куда отсюда» — те же стрелки списком: для клавиатуры, диктора и снимков
 * без направления, где стрелки на полу не нарисовать.
 */
export function LinkList({ tour, current, links, viewYaw, routeNext, onGo }: LinkListProps) {
  const node = tour.graph.getNode(current);
  const rotation = node ? (tour.planRotation(node.building, node.floor) ?? 0) : 0;

  if (links.length === 0) {
    return <p className="hint">Отсюда снимков рядом нет — стрелок не будет.</p>;
  }

  return (
    <ul className="link-list">
      {links.map((link) => {
        const world = link.bearing === null ? null : worldBearing(link.bearing, rotation);
        const side = world === null || viewYaw === null ? null : sideOf(world, viewYaw);
        const onRoute = link.target === routeNext;
        return (
          <li key={link.target}>
            <button
              type="button"
              className={onRoute ? 'link-list__item link-list__item--route' : 'link-list__item'}
              data-target={link.target}
              onClick={() => onGo(link.target, world)}
            >
              <span className="link-list__label">{linkLabel(tour, current, link)}</span>
              <span className="link-list__meta">
                {[onRoute ? 'по маршруту' : null, side, distanceText(link.distanceMeters)].filter(Boolean).join(' · ')}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
