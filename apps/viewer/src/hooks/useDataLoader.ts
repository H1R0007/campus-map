import { useCallback, useState } from 'react';
import { Graph, AliasManager } from '@campus-map/core';
import { useMapStore } from '../stores/mapStore';

const DATA_BASE_PATH = '/data';

interface LoaderState {
  isLoading: boolean;
  error: string | null;
}

export function useDataLoader() {
  const [state, setState] = useState<LoaderState>({
    isLoading: false,
    error: null,
  });

  const {
    setGraph,
    setAliasManager,
    setCampusMeta,
    addBuildingMeta,
    setDataLoaded,
  } = useMapStore();

  const loadJson = async <T>(path: string): Promise<T> => {
    const response = await fetch(`${DATA_BASE_PATH}${path}`);
    if (!response.ok) {
      throw new Error(`Failed to load ${path}: ${response.status}`);
    }
    return response.json();
  };

  const loadAllData = useCallback(async () => {
    setState({ isLoading: true, error: null });

    try {
      const graph = new Graph();
      const aliasManager = new AliasManager();

      // 1. Загружаем метаданные кампуса
      const campusMeta = await loadJson<{
        buildings: { id: string; name?: string }[];
        mapSize: { width: number; height: number };
      }>('/campus/meta.json');
      setCampusMeta(campusMeta);

      // 2. Загружаем граф кампуса
      const campusGraph = await loadJson<{ nodes: unknown[] }>('/campus/graph.json');
      graph.loadNodes(campusGraph as Parameters<typeof graph.loadNodes>[0], 'CAMPUS', 0);

      // 3. Загружаем каждое здание
      for (const building of campusMeta.buildings) {
        try {
          const buildingMeta = await loadJson<{
            id: string;
            name: string;
            floors: { floor: number; mapPath: string; graphPath: string }[];
            bounds?: { x: number; y: number; width: number; height: number };
          }>(`/buildings/${building.id}/meta.json`);

          addBuildingMeta(building.id, {
            id: buildingMeta.id,
            name: buildingMeta.name,
            floors: buildingMeta.floors,
            bounds: buildingMeta.bounds,
          });

          // 4. Загружаем графы этажей
          for (const floor of buildingMeta.floors) {
            try {
              const floorGraph = await loadJson<{ nodes: unknown[] }>(
                `/buildings/${building.id}/floors/${floor.floor}/graph.json`
              );
              graph.loadNodes(
                floorGraph as Parameters<typeof graph.loadNodes>[0],
                building.id,
                floor.floor
              );
            } catch (e) {
              console.warn(`Failed to load floor ${floor.floor} of ${building.id}:`, e);
            }
          }
        } catch (e) {
          console.warn(`Failed to load building ${building.id}:`, e);
        }
      }

      // 5. Загружаем переходы
      try {
        const transitions = await loadJson<{ transitions: unknown[] }>('/transitions.json');
        graph.loadTransitions(transitions as Parameters<typeof graph.loadTransitions>[0]);
      } catch (e) {
        console.warn('Failed to load transitions:', e);
      }

      // 6. Загружаем алиасы
      try {
        const aliases = await loadJson<{ aliases: unknown[] }>('/aliases.json');
        aliasManager.load(aliases as Parameters<typeof aliasManager.load>[0]);
      } catch (e) {
        console.warn('Failed to load aliases:', e);
      }

      // Сохраняем в store
      setGraph(graph);
      setAliasManager(aliasManager);
      setDataLoaded(true);

      console.log(`Loaded: ${graph.nodeCount} nodes, ${graph.transitionCount} transitions`);

      setState({ isLoading: false, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setState({ isLoading: false, error: message });
    }
  }, [setGraph, setAliasManager, setCampusMeta, addBuildingMeta, setDataLoaded]);

  return {
    ...state,
    loadAllData,
  };
}
