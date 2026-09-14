import React, { useEffect, useMemo, useRef } from 'react';
import { TRANSITION_COLORS, TransitionGlyph } from '@campus-map/mapkit';
import { useRouteSteps } from '../../hooks/useStepNavigation';
import { floorsOfBuilding, useMapStore } from '../../stores/mapStore';
import { useRouteStore } from '../../stores/routeStore';
import { formatFloor, messagesFor, useLanguage } from '../../i18n';
import type { Messages } from '../../i18n';
import { routeFloorScheme } from '../../utils/floorScheme';
import type { FloorLink, FloorRole } from '../../utils/floorScheme';

/** Подпись кнопки этажа для экранного диктора: роль в маршруте и текущий шаг. */
function floorLabel(messages: Messages, floor: number, role: FloorRole | null, currentStep: boolean): string {
  const label = messages.map.floor(formatFloor(floor));
  const withRole =
    role === 'start'
      ? messages.map.floorRouteStart(label)
      : role === 'end' || role === 'both'
        ? messages.map.floorRouteEnd(label)
        : role === 'pass'
          ? messages.map.floorOnRoute(label)
          : label;
  return currentStep ? messages.map.floorCurrentStep(withRole) : withRole;
}

/** Точка этажа на линии маршрута; центр линии — 8,5 px от левого края кнопки. */
function RouteDot({ role, active }: { role: FloorRole; active: boolean }) {
  const ring = active ? 'ring-primary' : 'ring-surface';
  const className =
    role === 'start'
      ? `left-[4.5px] w-2 h-2 bg-start ring-2 ${ring}`
      : role === 'pass'
        ? `left-[5.5px] w-1.5 h-1.5 ${active ? 'bg-white' : 'bg-accent'}`
        : `left-[3.5px] w-2.5 h-2.5 ring-2 ${ring} ${active ? 'bg-white' : 'bg-accent'}`;

  return <span aria-hidden="true" className={`absolute top-1/2 -translate-y-1/2 rounded-full ${className}`} />;
}

/** Значок лестницы или лифта на границе двух этажей — поверх обеих кнопок. */
function LinkBadge({ link }: { link: FloorLink }) {
  return (
    <span
      aria-hidden="true"
      data-transition={link.type}
      className="absolute left-0 bottom-0 z-10 translate-y-1/2 w-[17px] h-[17px] rounded-full ring-2 ring-surface text-white flex items-center justify-center"
      style={{ backgroundColor: TRANSITION_COLORS[link.type] }}
    >
      <TransitionGlyph type={link.type} size={11} />
    </span>
  );
}

/**
 * Этажи открытого корпуса — сверху вниз, как в здании, со схемой маршрута.
 *
 * Список занимает свободную высоту колонки (`MapRail`) и прокручивается: у
 * корпуса в 11 этажей с подвалом кнопки на телефоне не помещаются. Активный
 * этаж прокручивается в видимую часть.
 *
 * Схема маршрута — слева в кнопках: линия соединяет этажи, через которые идёт
 * маршрут, начало отмечено цветом начала, цель — фирменным, на границе этажей
 * — значок лестницы или лифта, которым их проходят. На шаге навигации этаж
 * шага обведён кольцом: видно, где человек сейчас. Раньше этажи маршрута были
 * одинаковыми точками, а что цель на третьем и туда ведёт лестница, читалось
 * только из текста шагов.
 *
 * Возврат на территорию и имя корпуса — в шапке карты (`MapHeader`).
 */
export const FloorSelector: React.FC = () => {
  const activeFloor = useMapStore((s) => s.activeFloor);
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const graph = useMapStore((s) => s.graph);
  const setActiveFloor = useMapStore((s) => s.setActiveFloor);
  const currentRoute = useRouteStore((s) => s.currentRoute);
  const stepIndex = useRouteStore((s) => s.stepIndex);
  const steps = useRouteSteps();
  const language = useLanguage();
  const messages = messagesFor(language);

  const activeButtonRef = useRef<HTMLButtonElement>(null);
  const buildingId = activeFloor?.buildingId ?? null;

  const scheme = useMemo(
    () =>
      graph && buildingId !== null && currentRoute?.found ? routeFloorScheme(graph, currentRoute, buildingId) : null,
    [graph, buildingId, currentRoute]
  );

  useEffect(() => {
    activeButtonRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeFloor]);

  if (activeFloor === null || !buildingMetas) return null;

  const stepScope = stepIndex !== null ? steps[stepIndex]?.scope : undefined;
  const stepFloor = stepScope?.mode === 'floor' && stepScope.buildingId === buildingId ? stepScope.floor : null;
  const floors = floorsOfBuilding(buildingMetas.get(activeFloor.buildingId));

  return (
    <nav aria-label={messages.map.floors} className="campus-floor-list">
      {floors.map((floor, index) => {
        const isActive = floor === activeFloor.floor;
        const role = scheme?.floors.get(floor) ?? null;
        const linkUp = scheme?.links.find((link) => link.lower === floor && link.upper === floors[index - 1]);
        const linkDown = scheme?.links.find((link) => link.upper === floor && link.lower === floors[index + 1]);
        const track = isActive ? 'bg-white/70' : 'bg-accent/60';
        const isStepFloor = floor === stepFloor;

        return (
          <button
            key={floor}
            ref={isActive ? activeButtonRef : undefined}
            type="button"
            onClick={() => setActiveFloor(activeFloor.buildingId, floor)}
            aria-current={isActive ? 'true' : undefined}
            aria-label={floorLabel(messages, floor, role, isStepFloor)}
            className={`relative w-11 h-11 flex-shrink-0 flex items-center justify-center text-sm font-semibold transition-colors ${
              isActive ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            {formatFloor(floor)}
            {linkUp && <span aria-hidden="true" className={`absolute left-[7px] top-0 h-1/2 w-[3px] ${track}`} />}
            {linkDown && <span aria-hidden="true" className={`absolute left-[7px] top-1/2 h-1/2 w-[3px] ${track}`} />}
            {role !== null && <RouteDot role={role} active={isActive} />}
            {isStepFloor && (
              <span
                aria-hidden="true"
                data-current-step
                className={`absolute left-[1.5px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 ${
                  isActive ? 'border-white' : 'border-accent'
                }`}
              />
            )}
            {linkDown && <LinkBadge link={linkDown} />}
          </button>
        );
      })}
    </nav>
  );
};
