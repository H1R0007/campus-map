import React, { useRef, useState } from 'react';
import { Marker, Polygon, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { PlacedPlan, ensurePane, meterLatLng } from '@campus-map/mapkit';
import { useMapView } from '../../hooks/useMapView';
import { useLanguage } from '../../i18n';
import { useMapStore } from '../../stores/mapStore';
import type { CanvasLayout } from '../../utils/canvasLayout';
import { buildingLabel } from '../../utils/placeLabels';

/** Pane крыш: над планами (`PLAN_PANE`), под линиями маршрута и точками. */
const ROOF_PANE = 'campusRoofs';
const ROOF_PANE_Z_INDEX = 360;

/** Название на крыше — когда корпус на экране длиннее этого, px: иначе надпись шире крыши. */
const ROOF_LABEL_PX = 96;

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

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char);

const roofLabels = new Map<string, L.DivIcon>();
function roofLabelIcon(text: string): L.DivIcon {
  let icon = roofLabels.get(text);
  if (!icon) {
    icon = L.divIcon({ className: 'campus-roof-label', iconSize: [0, 0], html: `<span>${escapeHtml(text)}</span>` });
    roofLabels.set(text, icon);
  }
  return icon;
}

/**
 * Планы холста кампуса: территория, крыши корпусов и их этажи (запись 32).
 *
 * Пока корпус мелкий, на нём крыша с названием. Приближенный корпус
 * (`revealedBuildings` — решает `CanvasCamera`) показывает свой открытый этаж:
 * крыша гаснет, план проявляется. Этажи, уже побывавшие на экране, остаются
 * на карте прозрачными — смена этажа плавная и без повторной загрузки.
 */
export const CanvasPlans: React.FC<{ layout: CanvasLayout }> = ({ layout }) => {
  const map = useMap();
  const view = useMapView();
  const buildingMetas = useMapStore((s) => s.buildingMetas);
  const language = useLanguage();

  // Pane — до первой крыши: слои-дети добавляются на карту раньше эффектов родителя.
  useState(() => ensurePane(map, ROOF_PANE, ROOF_PANE_Z_INDEX));

  // Этажи, побывавшие на экране, по корпусам; набор только растёт.
  const mountedFloors = useRef(new Map<string, Set<number>>());

  const pixelsPerMeterNow = () => map.getZoomScale(map.getZoom(), 0);
  const [pixelsPerMeter, setPixelsPerMeter] = useState(pixelsPerMeterNow);
  useMapEvents({ zoomend: () => setPixelsPerMeter(pixelsPerMeterNow()) });

  if (view.kind !== 'canvas') return null;

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

      {layout.buildings.map((building) => {
        const revealed = view.revealed.has(building.id);
        const floor = view.floors.get(building.id);

        const mounted = mountedFloors.current.get(building.id) ?? new Set<number>();
        if (revealed && floor !== undefined) mounted.add(floor);
        mountedFloors.current.set(building.id, mounted);

        const center = {
          x: building.footprint.reduce((sum, corner) => sum + corner.x, 0) / building.footprint.length,
          y: building.footprint.reduce((sum, corner) => sum + corner.y, 0) / building.footprint.length,
        };
        const name = buildingMetas ? buildingLabel(buildingMetas, building.id, language) : building.id;

        return (
          <React.Fragment key={building.id}>
            {[...mounted].map((mountedFloor) => {
              const plan = building.floors.get(mountedFloor);
              return plan ? (
                <PlacedPlan
                  key={mountedFloor}
                  url={plan.url}
                  format={plan.format}
                  placement={plan.placement}
                  fallbackSize={plan.size}
                  visible={revealed && mountedFloor === floor}
                  className="campus-canvas-plan"
                  data={floorDataOf(building.id, mountedFloor)}
                />
              ) : null;
            })}
            {/* Класс Leaflet ставит только при создании пути — состояние входит в ключ. */}
            <Polygon
              key={revealed ? 'open' : 'roof'}
              positions={building.footprint.map(meterLatLng)}
              pane={ROOF_PANE}
              className={revealed ? 'campus-roof campus-roof--open' : 'campus-roof'}
              interactive={false}
            />
            {!revealed && building.span * pixelsPerMeter >= ROOF_LABEL_PX && (
              <Marker position={meterLatLng(center)} icon={roofLabelIcon(name)} interactive={false} keyboard={false} />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
};
