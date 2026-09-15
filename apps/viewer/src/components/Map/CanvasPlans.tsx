import React, { useEffect, useRef, useState } from 'react';
import { Marker, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import { PlacedPlan, ensurePane, meterLatLng } from '@campus-map/mapkit';
import { useMapView } from '../../hooks/useMapView';
import { useLanguage } from '../../i18n';
import { useMapStore } from '../../stores/mapStore';
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
 * это DOM подробного SVG.
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
 * элементы читают проявленность этажа своего корпуса (`--reveal`) из переменных
 * карты, которые каждый кадр пишет `CanvasPlans`.
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

/** Правила, связывающие класс корпуса с переменными карты. */
function buildingStyles(count: number): string {
  return Array.from(
    { length: count },
    (_, index) =>
      `.${buildingClass(index)} { --reveal: var(--reveal-${index}, 0); --fits: var(--roof-label-${index}, 0); }`
  ).join('\n');
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
 * Крыша тает, а этаж проявляется плавно, вместе с масштабом: доля экрана,
 * которую занимает корпус (`canvasReveal.ts`), каждый кадр пишется в переменную
 * карты, и крыша, название и план читают её правилами CSS — без перерисовки
 * React. План этажа грузится заранее, когда камера подлетает к корпусу
 * (`nearBuildings`), и остаётся на карте прозрачным: смена этажа плавная и без
 * повторной загрузки, пока этажей на карте не больше `MAX_MOUNTED_FLOORS`.
 */
export const CanvasPlans: React.FC<{ layout: CanvasLayout }> = ({ layout }) => {
  const map = useMap();
  const view = useMapView();
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const nearBuildings = useMapStore((s) => s.nearBuildings);
  const language = useLanguage();
  const insets = useMapInsets();

  // Pane — до первой крыши: слои-дети добавляются на карту раньше эффектов родителя.
  useState(() => ensurePane(map, ROOF_PANE, ROOF_PANE_Z_INDEX));

  const names = layout.buildings.map((building) =>
    buildingMetas ? buildingLabel(buildingMetas, building.id, language) : building.id
  );
  const namesKey = names.join('\n');

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = buildingStyles(layout.buildings.length);
    map.getContainer().append(style);
    return () => style.remove();
  }, [map, layout]);

  useEffect(() => {
    const container = map.getContainer();
    const labelWidths = namesKey.split('\n').map(roofLabelWidth);

    const update = () => {
      const size = map.getSize();
      const pixelsPerMeter = map.getZoomScale(map.getZoom(), 0);
      const freeWidth = size.x - insets.left - insets.right;
      const freeHeight = size.y - insets.top - insets.bottom;

      layout.buildings.forEach((building, index) => {
        const share = screenShare(building.span, pixelsPerMeter, freeWidth, freeHeight);
        container.style.setProperty(`--reveal-${index}`, revealAmount(share).toFixed(3));
        container.style.setProperty(
          `--roof-label-${index}`,
          building.span * pixelsPerMeter >= labelWidths[index] ? '1' : '0'
        );
      });
    };

    update();
    map.on('zoom viewreset resize', update);
    return () => {
      map.off('zoom viewreset resize', update);
    };
  }, [map, layout, insets, namesKey]);

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
