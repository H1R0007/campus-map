import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';
import { createDataSlice } from './editor/dataSlice';
import { createEditSlice } from './editor/editSlice';
import { createKindSlice } from './editor/kindSlice';
import { createClipboardSlice } from './editor/clipboardSlice';
import { createHistorySlice } from './editor/historySlice';
import { createPanelSlice } from './editor/panelSlice';
import { createRouteSlice } from './editor/routeSlice';
import { createSelectionSlice } from './editor/selectionSlice';
import { createStorageSlice } from './editor/storageSlice';
import { createStructureSlice } from './editor/structureSlice';
import { createAlignSlice } from './editor/alignSlice';
import { createPlaceSlice } from './editor/placeSlice';
import { createToolSlice } from './editor/toolSlice';
import { createViewSlice } from './editor/viewSlice';
import { createWindowSlice, syncWindowsIn, windowsOutOfSync } from './editor/windowSlice';
import type { EditorStore } from './editor/types';

/**
 * Стор редактора — точка сборки срезов (`stores/editor/*`).
 *
 * Компоненты импортируют стор и его типы отсюда; из какого среза пришло
 * поле, им знать не нужно.
 */

enableMapSet();

export const useEditorStore = create<EditorStore>()(
  immer((...a) => ({
    ...createDataSlice(...a),
    ...createViewSlice(...a),
    ...createSelectionSlice(...a),
    ...createToolSlice(...a),
    ...createEditSlice(...a),
    ...createKindSlice(...a),
    ...createClipboardSlice(...a),
    ...createHistorySlice(...a),
    ...createPanelSlice(...a),
    ...createRouteSlice(...a),
    ...createStorageSlice(...a),
    ...createStructureSlice(...a),
    ...createAlignSlice(...a),
    ...createPlaceSlice(...a),
    ...createWindowSlice(...a),
  }))
);

// Вкладки карт идут за открытым планом (запись 66): его меняют и прежние
// действия — «Отменить», удаление корпуса, импорт архива, — не зная о вкладках.
// Подписка первая из всех, поэтому экран видит уже согласованное состояние.
useEditorStore.subscribe((state, previous) => {
  if (
    state.currentBuilding === previous.currentBuilding &&
    state.currentFloor === previous.currentFloor &&
    state.buildingMetas === previous.buildingMetas &&
    state.mapGroups === previous.mapGroups
  ) {
    return;
  }
  if (windowsOutOfSync(state)) useEditorStore.setState((draft) => syncWindowsIn(draft));
});

export type { EditorStore } from './editor/types';
export type { EditorTool, LineToolState } from './editor/toolSlice';
export type { DisplayFilters, GridSettings } from './editor/viewSlice';
export type { RouteSimulation } from './editor/routeSlice';
export type { MapGroup, MapTab, OpenHow, PlanRef } from './editor/windowSlice';
export type { ContextMenuTarget, EditorNotice } from './editor/panelSlice';
export type { AddTransitionResult } from './editor/editSlice';
export type { NodePair } from './editor/selectionSlice';
export { selectedRoute } from './editor/graphState';
export { useUnsavedChanges } from './useUnsavedChanges';
