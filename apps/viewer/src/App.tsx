import React, { useEffect } from 'react';
import { CampusMap } from './components/Map/CampusMap';
import { BottomSheet } from './components/UI/BottomSheet';
import { FloorSelector } from './components/UI/FloorSelector';
import { BuildingSelector } from './components/UI/BuildingSelector';
import { useMapStore } from './stores/mapStore';
import { useDataLoader } from './hooks/useDataLoader';

const App: React.FC = () => {
  const { isLoading, error, loadAllData } = useDataLoader();
  const isDataLoaded = useMapStore((state) => state.isDataLoaded);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Экран загрузки
  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Загрузка карты...</p>
        </div>
      </div>
    );
  }

  // Экран ошибки
  if (error) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gray-100 p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-gray-800 mb-2">Не удалось загрузить</h1>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  if (!isDataLoaded) {
    return null;
  }

  return (
    <div className="h-full w-full relative overflow-hidden">
      {/* Карта */}
      <CampusMap />

      {/* UI элементы */}
      <BuildingSelector />
      <FloorSelector />
      <BottomSheet />
    </div>
  );
};

export default App;
