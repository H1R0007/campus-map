/**
 * Pane карты редактора (запись 50): картинка плана — ниже корпусов на
 * территории, корпуса — ниже точек и линий (`overlayPane`, 400).
 */
export const EDITOR_UNDERLAY = { name: 'editorUnderlay', zIndex: 350 };
export const BUILDINGS_PANE = { name: 'editorBuildings', zIndex: 380 };

/** План, который размещают, — над остальными корпусами (запись 62). */
export const PLACING_PANE = { name: 'editorPlacing', zIndex: 385 };

/** Эталон линиями — поверх плана, который размещают, под точками. */
export const REFERENCE_PANE = { name: 'editorReference', zIndex: 390 };
