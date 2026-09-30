import type { StateCreator } from 'zustand';
import type { DataSlice } from './dataSlice';
import type { EditSlice } from './editSlice';
import type { HistorySlice } from './historySlice';
import type { PanelSlice } from './panelSlice';
import type { RouteSlice } from './routeSlice';
import type { SelectionSlice } from './selectionSlice';
import type { StorageSlice } from './storageSlice';
import type { StructureSlice } from './structureSlice';
import type { AlignSlice } from './alignSlice';
import type { PlaceSlice } from './placeSlice';
import type { ToolSlice } from './toolSlice';
import type { ViewSlice } from './viewSlice';
import type { WindowSlice } from './windowSlice';

/**
 * Стор редактора целиком — объединение срезов.
 *
 * Срез — состояние одной темы и действия над ним: данные кампуса, вид карты,
 * выделение, инструменты, правка графа, отмена, панели, симулятор маршрута.
 * Действие среза видит весь стор (`get()`) и пишет в любую его часть (`set`):
 * загрузка датасета, например, сбрасывает и выделение, и начатые инструменты.
 * Раньше всё это жило одним файлом на 2200 строк.
 */
export type EditorStore = DataSlice &
  ViewSlice &
  SelectionSlice &
  ToolSlice &
  EditSlice &
  HistorySlice &
  PanelSlice &
  RouteSlice &
  StorageSlice &
  StructureSlice &
  AlignSlice &
  PlaceSlice &
  WindowSlice;

/** Создатель среза: `set` с immer поверх всего стора, срез возвращает свою часть. */
export type EditorSlice<T> = StateCreator<EditorStore, [['zustand/immer', never]], [], T>;
