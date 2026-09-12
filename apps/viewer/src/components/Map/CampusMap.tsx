import React, { useEffect, useMemo, useState } from 'react';
import { ImageOverlay, MapContainer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useMapStore } from '../../stores/mapStore';
import { PathLayer } from './PathLayer';
import { MarkerLayer } from './MarkerLayer';

const FALLBACK = { width: 1200, height: 800 };

function useImageSize(url: string, fallback: { width: number; height: number }) {
  const [size, setSize] = useState(fallback);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      if (img.width > 0 && img.height > 0) {
        setSize({ width: img.width, height: img.height });
      } else {
        setSize(fallback);
      }
    };
    img.onerror = () => {
      if (!cancelled) setSize(fallback);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url, fallback.width, fallback.height]);

  return size;
}

const FitToBounds: React.FC<{ bounds: L.LatLngBoundsExpression }> = ({ bounds }) => {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [20, 20] });
  }, [map, JSON.stringify(bounds)]);
  return null;
};

export const CampusMap: React.FC = () => {
  const campusMeta = useMapStore((s) => s.campusMeta);
  const viewMode = useMapStore((s) => s.viewMode);
  const activeFloor = useMapStore((s) => s.activeFloor);

  const mapUrl = useMemo(() => {
    if (viewMode === 'campus') return '/data/campus/map.png';
    if (activeFloor) return `/data/buildings/${activeFloor.buildingId}/floors/${activeFloor.floor}/map.png`;
    return '/data/campus/map.png';
  }, [viewMode, activeFloor]);

  const fallbackSize = campusMeta?.mapSize ?? FALLBACK;
  const size = useImageSize(mapUrl, fallbackSize);

  const bounds: L.LatLngBoundsExpression = useMemo(
    () => [
      [0, 0],
      [size.height, size.width],
    ],
    [size.width, size.height]
  );

  const maxBounds: L.LatLngBoundsExpression = useMemo(
    () => [
      [-size.height * 0.2, -size.width * 0.2],
      [size.height * 1.2, size.width * 1.2],
    ],
    [size.width, size.height]
  );

  return (
    <MapContainer
      key={mapUrl} // важное: при смене картинки пересоздаём карту, чтобы bounds точно применились
      center={[size.height / 2, size.width / 2]}
      zoom={0}
      minZoom={-2}
      maxZoom={4}
      crs={L.CRS.Simple}
      maxBounds={maxBounds}
      maxBoundsViscosity={0.8}
      zoomControl={false}
      attributionControl={false}
      className="w-full h-full"
    >
      <ImageOverlay url={mapUrl} bounds={bounds} />
      <FitToBounds bounds={bounds} />
      <PathLayer />
      <MarkerLayer />
    </MapContainer>
  );
};
