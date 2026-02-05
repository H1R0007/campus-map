import React from 'react';
import { useMap } from 'react-leaflet';
import { useMapStore } from '../../stores/mapStore';

export const ZoomControls: React.FC = () => {
  const map = useMap();
  const zoomLevel = useMapStore((state) => state.zoomLevel);

  const handleZoomIn = () => {
    map.zoomIn();
  };

  const handleZoomOut = () => {
    map.zoomOut();
  };

  const handleResetView = () => {
    map.setView([390, 738], 0);
  };

  return (
    <div
      className="absolute bottom-6 right-4 flex flex-col gap-2"
      style={{ zIndex: 1000 }}
    >
      <button
        onClick={handleZoomIn}
        className="
          w-11 h-11 bg-white rounded-xl shadow-lg
          flex items-center justify-center
          hover:bg-gray-50 active:scale-95
          transition-all
        "
        aria-label="Приблизить"
      >
        <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
      
      <button
        onClick={handleZoomOut}
        className="
          w-11 h-11 bg-white rounded-xl shadow-lg
          flex items-center justify-center
          hover:bg-gray-50 active:scale-95
          transition-all
        "
        aria-label="Отдалить"
      >
        <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
        </svg>
      </button>

      <button
        onClick={handleResetView}
        className="
          w-11 h-11 bg-white rounded-xl shadow-lg
          flex items-center justify-center
          hover:bg-gray-50 active:scale-95
          transition-all mt-2
        "
        aria-label="Сбросить вид"
      >
        <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
      </button>
    </div>
  );
};