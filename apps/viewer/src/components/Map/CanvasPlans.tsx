import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Marker, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import { PlacedPlan, ensurePane, meterLatLng } from '@campus-map/mapkit';
import { useColorScheme } from '../../hooks/useColorScheme';
import { useMapView } from '../../hooks/useMapView';
import { useLanguage } from '../../i18n';
import { useMapStore } from '../../stores/mapStore';
import { planStyleFor } from '../../theme/planTheme';
import type { CanvasLayout } from '../../utils/canvasLayout';
import { revealAmount, roofLabelWidth, screenShare } from '../../utils/canvasReveal';
import { buildingLabel } from '../../utils/placeLabels';
import { useMapInsets } from './mapChrome';

/** Pane крыш: над планами (`PLAN_PANE`), под линиями маршрута и точками. */
const ROOF_PANE = 'campusRoofs';
const ROOF_PANE_Z_INDEX = 360;

/**
 * Больше стольких планов этажей на карте не держится: давно не нужные
 * снимаются. У официального кампуса этажей сотни, а план в памяти страницы —
 * это декодированное изображение.
 */
const MAX_MOUNTED_FLOORS = 12;

const CAMPUS_DATA = Object.freeze({ plan: 'campus' });

/** Атрибуты плана этажа — один объект на этаж, чтобы слой не переписывал их на каждом кадре. */
const floorData = new Map<string, Readonly<Record<string, string>>>();
function floorDataOf(buildingId: string, floor: number): Readonly<Record<string, string>> {
  const key = `${buildingId}#${floor}`;
  let data = floorData.get(key);
  if (!data) {
    data = Object.freeze({ plan: 'floor', building: buildingId, floor: String(floor) });
    floorData.set(key, data);
  }
  return data;
}

/**
 * Класс всего, что относится к корпусу на холсте: план, крыша, название. По нему
 * `CanvasPlans` находит их и ставит проявленность этажа своего корпуса.
 */
const buildingClass = (index: number) => `campus-building-${index}`;

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char);

const roofLabels = new Map<string, L.DivIcon>();
function roofLabelIcon(text: string, index: number): L.DivIcon {
  const key = `${index}:${text}`;
  let icon = roofLabels.get(key);
  if (!icon) {
    icon = L.divIcon({
      className: `campus-roof-label ${buildingClass(index)}`,
      iconSize: [0, 0],
      html: `<span>${escapeHtml(text)}</span>`,
    });
    roofLabels.set(key, icon);
  }
  return icon;
}

/** Этаж, который держится на карте, и когда он был нужен последний раз. */
interface MountedFloor {
  buildingId: string;
  floor: number;
  used: number;
}

/**
 * Планы холста кампуса: территория, крыши корпусов и их этажи (записи 32 и 33).
 *
 * Крыша тает, а этаж проявляется плавно, вместе с масштабом: по доле экрана,
 * которую занимает корпус (`canvasReveal.ts`), проявленность каждый кадр
 * ставится прямо в стили крыши, названия и плана — без перерисовки React.
 * Планы — изображения (запись 35). План этажа грузится заранее, когда камера
 * подлетает к корпусу (`nearBuildings`), и остаётся на карте прозрачным: смена
 * этажа плавная и без повторной загрузки, пока этажей на карте не больше
 * `MAX_MOUNTED_FLOORS`.
 */
export const CanvasPlans: React.FC<{ layout: CanvasLayout }> = ({ layout }) => {
  const map = useMap();
  const view = useMapView();
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const nearBuildings = useMapStore((s) => s.nearBuildings);
  const language = useLanguage();
  const insets = useMapInsets();
  const scheme = useColorScheme();
  const floorStyle = useMemo(() => planStyleFor(scheme), [scheme]);
  const campusStyle = useMemo(() => planStyleFor(scheme, true), [scheme]);

  // Pane — до первой крыши: слои-дети добавляются на карту раньше эффектов родителя.
  useState(() => ensurePane(map, ROOF_PANE, ROOF_PANE_Z_INDEX));

  const names = layout.buildings.map((building) =>
    buildingMetas ? buildingLabel(buildingMetas, building.id, language) : building.id
  );
  const namesKey = names.join('\n');

  // Проявление этажей — каждый кадр масштаба, прямо в стили крыши, названия и
  // обёртки плана, и только у корпусов, чья проявленность изменилась. Прежде
  // переменная ставилась всей карте, и браузер на каждом кадре пересчитывал
  // стили всего холста (запись 33).
  const applyReveal = useRef<(force: boolean) => void>(() => undefined);

  useEffect(() => {
    const container = map.getContainer();
    const labelWidths = namesKey.split('\n').map(roofLabelWidth);
    const groups = layout.buildings.map((_, index) => container.getElementsByClassName(buildingClass(index)));
    const applied: string[] = [];

    const update = (force: boolean) => {
      const size = map.getSize();
      const pixelsPerMeter = map.getZoomScale(map.getZoom(), 0);
      const freeWidth = size.x - insets.left - insets.right;
      const freeHeight = size.y - insets.top - insets.bottom;

      layout.buildings.forEach((building, index) => {
        const reveal = Math.round(revealAmount(screenShare(building.span, pixelsPerMeter, freeWidth, freeHeight)) * 100) / 100;
        const fits = building.span * pixelsPerMeter >= labelWidths[index];
        const key = `${reveal}|${fits}`;
        if (!force && applied[index] === key) return;
        applied[index] = key;

        for (const element of groups[index]) {
          const style = (element as HTMLElement | SVGElement).style;
          if (element.classList.contains('campus-roof')) {
            style.fillOpacity = String(Math.round(0.96 * (1 - reveal) * 100) / 100);
            style.strokeOpacity = String(1 - reveal);
          } else if (element.classList.contains('campus-roof-label')) {
            style.opacity = String(fits ? Math.max(0, 1 - 2 * reveal) : 0);
          } else {
            // Обёртка содержимого плана: у самого плана прозрачность занята
            // сменой этажа. Непроявленный план убран из раскладки совсем —
            // скрытый прозрачностью браузер всё равно раскладывал бы и рисовал.
            const content = element.firstElementChild as HTMLElement | null;
            if (content) {
              content.style.opacity = String(reveal);
              content.style.display = reveal > 0 ? 'block' : 'none';
            }
          }
        }
      });
    };

    applyReveal.current = update;
    update(true);
    const onFrame = () => update(false);
    map.on('zoom viewreset resize', onFrame);
    return () => {
      map.off('zoom viewreset resize', onFrame);
      applyReveal.current = () => undefined;
    };
  }, [map, layout, insets, namesKey]);

  // Новые планы, крыши и названия появляются на карте в эффектах дочерних
  // слоёв — раньше этого эффекта: проявленность ставится и им.
  useEffect(() => {
    applyReveal.current(true);
  });

  // Этажи на карте: давно не нужные снимаются, когда их больше предела.
  const mounted = useRef(new Map<string, MountedFloor>());
  const renders = useRef(0);

  if (view.kind !== 'canvas') return null;

  renders.current += 1;
  const near = new Set(nearBuildings);
  for (const building of layout.buildings) {
    const floor = view.floors.get(building.id);
    if (near.has(building.id) && floor !== undefined) {
      mounted.current.set(`${building.id}#${floor}`, { buildingId: building.id, floor, used: renders.current });
    }
  }
  const stale = [...mounted.current.entries()]
    .filter(([, entry]) => entry.used !== renders.current)
    .sort((a, b) => a[1].used - b[1].used);
  for (const [key] of stale.slice(0, Math.max(0, mounted.current.size - MAX_MOUNTED_FLOORS))) {
    mounted.current.delete(key);
  }
  const mountedFloors = [...mounted.current.values()];

  return (
    <>
      {layout.campus && (
        <PlacedPlan
          url={layout.campus.url}
          format={layout.campus.format}
          placement={layout.campus.placement}
          fallbackSize={layout.campus.size}
          svgStyle={campusStyle}
          className="campus-canvas-plan"
          data={CAMPUS_DATA}
        />
      )}

      {layout.buildings.map((building, index) => {
        const floor = view.floors.get(building.id);
        const isNear = near.has(building.id);
        const revealed = view.revealed.has(building.id);
        const center = {
          x: building.footprint.reduce((sum, corner) => sum + corner.x, 0) / building.footprint.length,
          y: building.footprint.reduce((sum, corner) => sum + corner.y, 0) / building.footprint.length,
        };

        return (
          <React.Fragment key={building.id}>
            {mountedFloors
              .filter((entry) => entry.buildingId === building.id)
              .map((entry) => {
                const plan = building.floors.get(entry.floor);
                const current = entry.floor === floor;
                return plan ? (
                  <PlacedPlan
                    key={entry.floor}
                    url={plan.url}
                    format={plan.format}
                    placement={plan.placement}
                    fallbackSize={plan.size}
                    svgStyle={floorStyle}
                    visible={isNear && current}
                    reportStatus={revealed && current}
                    className={`campus-canvas-plan ${buildingClass(index)}`}
                    data={floorDataOf(building.id, entry.floor)}
                  />
                ) : null;
              })}
            <Polygon
              positions={building.footprint.map(meterLatLng)}
              pane={ROOF_PANE}
              className={`campus-roof ${buildingClass(index)}`}
              interactive={false}
            />
            <Marker
              position={meterLatLng(center)}
              icon={roofLabelIcon(names[index], index)}
              interactive={false}
              keyboard={false}
            />
          </React.Fragment>
        );
      })}
    </>
  );
};
