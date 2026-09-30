import { useEditorStore } from '../stores/editorStore';

/** Какая операция открыта — для заголовка правой колонки. */
export function useOperationTitle(): string | null {
  return useEditorStore((s) =>
    s.placing
      ? s.placing.mode === 'floor'
        ? 'Совмещение этажа'
        : 'Размещение корпуса'
      : s.measuring
        ? 'Масштаб территории'
        : s.alignment
          ? 'Совмещение точек'
          : null
  );
}
