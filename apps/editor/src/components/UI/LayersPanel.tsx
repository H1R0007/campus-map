import React from 'react';
import { useEditorStore } from '../../stores/editorStore';

export const LayersPanel: React.FC = () => {
  const currentBuilding = useEditorStore((state) => state.currentBuilding);
  const currentFloor = useEditorStore((state) => state.currentFloor);
  const buildingMetas = useEditorStore((state) => state.buildingMetas);
  const setCurrentBuilding = useEditorStore((state) => state.setCurrentBuilding);
  const setCurrentFloor = useEditorStore((state) => state.setCurrentFloor);

  const buildings = Array.from(buildingMetas.values());

  return (
    <div className="w-60 bg-editor-panel border-r border-editor-accent flex flex-col">
      {/* Заголовок */}
      <div className="p-4 border-b border-editor-accent">
        <h2 className="text-sm font-semibold text-gray-300">Слои</h2>
      </div>

      {/* Список */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Кампус */}
        <button
          onClick={() => setCurrentBuilding(null)}
          className={`
            w-full px-3 py-2 rounded-lg text-left text-sm
            flex items-center gap-2 transition-colors
            ${!currentBuilding
              ? 'bg-editor-highlight text-white'
              : 'text-gray-400 hover:bg-editor-accent hover:text-white'
            }
          `}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          Кампус
        </button>

        {/* Корпуса */}
        <div className="mt-4">
          <p className="px-3 py-1 text-xs font-medium text-gray-500 uppercase">Корпуса</p>

          {buildings.map((building) => (
            <div key={building.id} className="mt-1">
              {/* Заголовок корпуса */}
              <button
                onClick={() => {
                  setCurrentBuilding(building.id);
                  setCurrentFloor(building.floors[0]?.floor ?? 1);
                }}
                className={`
                  w-full px-3 py-2 rounded-lg text-left text-sm
                  flex items-center gap-2 transition-colors
                  ${currentBuilding === building.id
                    ? 'bg-editor-accent text-white'
                    : 'text-gray-400 hover:bg-editor-accent/50 hover:text-white'
                  }
                `}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                {building.name}
              </button>

              {/* Этажи (если корпус выбран) */}
              {currentBuilding === building.id && (
                <div className="ml-6 mt-1 space-y-0.5">
                  {building.floors
                    .slice()
                    .sort((a, b) => b.floor - a.floor)
                    .map((floor) => (
                      <button
                        key={floor.floor}
                        onClick={() => setCurrentFloor(floor.floor)}
                        className={`
                          w-full px-3 py-1.5 rounded text-left text-sm
                          transition-colors
                          ${currentFloor === floor.floor
                            ? 'bg-editor-highlight text-white'
                            : 'text-gray-500 hover:text-white hover:bg-editor-accent/30'
                          }
                        `}
                      >
                        Этаж {floor.floor}
                      </button>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Статистика */}
      <div className="p-4 border-t border-editor-accent">
        <p className="text-xs text-gray-500">
          {currentBuilding
            ? `${buildingMetas.get(currentBuilding)?.name}, этаж ${currentFloor}`
            : 'Уровень кампуса'
          }
        </p>
      </div>
    </div>
  );
};
