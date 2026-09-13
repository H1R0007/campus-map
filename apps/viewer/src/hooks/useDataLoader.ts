import { useCallback, useState } from 'react';
import {
  AliasManager,
  Graph,
  createHttpDatasetSource,
  indexBuildingMetas,
  loadDataset,
} from '@campus-map/core';
import { useMapStore } from '../stores/mapStore';
import { DATA_BASE_URL } from '../config/dataBase';

/**
 * Загрузка датасета кампуса в стор карты.
 *
 * Сам пайплайн чтения и нормализации живёт в ядре (`loadDataset`) и один на
 * все приложения — навигатор, редактор и импорт из ZIP. Здесь остаётся
 * только привязка к HTTP и запись результата в стор.
 */

interface DataLoaderState {
  isLoading: boolean;
  error: string | null;
}

/**
 * Техническая причина отказа — для того, кому о ней сообщат.
 *
 * Не переводится: это текст исключения, а не строка интерфейса. Раньше для
 * не-`Error` здесь стояла заглушка «Неизвестная ошибка» — по-русски и без
 * единой детали; само значение полезнее.
 */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useDataLoader() {
  const [state, setState] = useState<DataLoaderState>({ isLoading: false, error: null });
  const setData = useMapStore((s) => s.setData);

  const loadAllData = useCallback(async () => {
    setState({ isLoading: true, error: null });

    try {
      const { dataset, warnings } = await loadDataset(
        createHttpDatasetSource({ baseUrl: DATA_BASE_URL })
      );

      // Ядро не пишет в консоль, поэтому о нештатных данных сообщает сюда.
      // Загрузка не прерывается: частичные данные лучше полного отказа.
      for (const warning of warnings) {
        console.warn(`[campus-map] ${warning}`);
      }

      const aliasManager = new AliasManager();
      aliasManager.load(dataset.aliases);

      setData({
        graph: Graph.fromDataset(dataset),
        aliasManager,
        campusMeta: dataset.campusMeta,
        buildingMetas: indexBuildingMetas(dataset.buildingMetas),
      });

      setState({ isLoading: false, error: null });
    } catch (error) {
      console.error('[campus-map] не удалось загрузить данные', error);
      setState({ isLoading: false, error: describeError(error) });
    }
  }, [setData]);

  return { ...state, loadAllData };
}
