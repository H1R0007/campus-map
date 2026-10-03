import React, { useMemo } from 'react';
import L from 'leaflet';
import { Marker } from 'react-leaflet';
import { landmarkText } from '@campus-map/core';
import { useRouteSteps } from '../../hooks/useStepNavigation';
import { useMapView } from '../../hooks/useMapView';
import { useLanguage } from '../../i18n';
import { DATA_LANGUAGE } from '../../i18n/languages';
import { useMapStore } from '../../stores/mapStore';
import { useRouteStore } from '../../stores/routeStore';
import { isNodeShown, mapPointOf } from '../../utils/mapView';

/** Текст в разметку значка — без разметки внутри. */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/**
 * Ориентир текущего шага на карте (запись 86): подпись «Кофейный автомат» над
 * точкой, где поворачивать. Человек сверяет карту с тем, что видит, а точка
 * поворота на карте иначе ничем не отличается от остальных точек коридора.
 *
 * Фото на карте не ставится: флажок с фото закрывал бы план ровно там, куда
 * идти дальше. Фото — в панели шага.
 */
export const LandmarkLayer: React.FC = () => {
  const steps = useRouteSteps();
  const stepIndex = useRouteStore((s) => s.stepIndex);
  const graph = useMapStore((s) => s.graph);
  const view = useMapView();
  const language = useLanguage();

  const step = stepIndex !== null ? steps[stepIndex] : undefined;
  const node = step?.kind === 'landmark' && step.subject ? graph?.getNode(step.subject) : undefined;
  const name = node?.landmark ? landmarkText(node.landmark, language, DATA_LANGUAGE).name : null;

  const icon = useMemo(
    () =>
      name === null
        ? null
        : L.divIcon({
            className: 'campus-landmark',
            iconSize: [0, 0],
            html: `<div class="campus-landmark__body">${escapeHtml(name)}</div>`,
          }),
    [name]
  );

  if (!graph || !node || icon === null || !isNodeShown(view, node)) return null;

  return <Marker position={mapPointOf(graph, view, node)} icon={icon} interactive={false} keyboard={false} zIndexOffset={900} />;
};
