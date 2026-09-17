import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';
import { createDataSlice } from './editor/dataSlice';
import { createEditSlice } from './editor/editSlice';
import { createHistorySlice } from './editor/historySlice';
import { createPanelSlice } from './editor/panelSlice';
import { createRouteSlice } from './editor/routeSlice';
import { createSelectionSlice } from './editor/selectionSlice';
import { createStorageSlice } from './editor/storageSlice';
import { createToolSlice } from './editor/toolSlice';
import { createViewSlice } from './editor/viewSlice';
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
    ...createHistorySlice(...a),
    ...createPanelSlice(...a),
    ...createRouteSlice(...a),
    ...createStorageSlice(...a),
  }))
);

export type { EditorStore } from './editor/types';
export type { EditorTool, LineToolState } from './editor/toolSlice';
export type { DisplayFilters, GridSettings } from './editor/viewSlice';
export type { RouteSimulation } from './editor/routeSlice';
export type { ContextMenuTarget, EditorNotice } from './editor/panelSlice';
export type { AddTransitionResult } from './editor/editSlice';
export type { NodePair } from './editor/selectionSlice';
export { selectedRoute } from './editor/graphState';
export { useUnsavedChanges } from './useUnsavedChanges';
