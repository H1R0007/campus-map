import React, { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { planScopeKey } from '../../utils/planFiles';
import { Icon } from './Icon';

/**
 * Файлы, брошенные на редактор, открывают окно «Планы из файлов» (запись 48).
 *
 * Пока файлы несут над окном, поверх всего — подсказка «отпустите». Корпус,
 * который открыт, подставляется листам, у которых корпус не угадан: план
 * этажа обычно бросают, стоя в его корпусе. На этаж без плана — и сам этаж.
 */
export const ImportDropZone: React.FC = () => {
  const openImport = useEditorStore((s) => s.openImport);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    let quiet: number | undefined;
    const reset = () => {
      window.clearTimeout(quiet);
      depth.current = 0;
      setDragging(false);
    };
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current += 1;
      setDragging(true);
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      // Ушли за пределы окна браузера — перетаскивания над редактором больше нет.
      if (event.relatedTarget === null) {
        reset();
        return;
      }
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const over = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      // Пока файл несут, браузер повторяет dragover без остановки; тишина —
      // перетаскивание кончилось, как бы оно ни кончилось.
      window.clearTimeout(quiet);
      quiet = window.setTimeout(reset, 600);
    };
    // Подсказка прячется при любом броске — даже если его забрало открытое
    // окно «Планы из файлов» и дальше событие не пустило. Поэтому — на
    // перехвате, раньше всех.
    const dropCapture = () => reset();
    const drop = (event: DragEvent) => {
      if (!hasFiles(event) || event.defaultPrevented) return;
      event.preventDefault();
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length === 0) return;
      const { currentBuilding, currentFloor, planFiles } = useEditorStore.getState();
      const floorWithoutPlan =
        currentBuilding !== null && currentFloor !== null && !planFiles.has(planScopeKey(currentBuilding, currentFloor));
      openImport(
        files,
        currentBuilding === null
          ? planFiles.has(planScopeKey(null, null))
            ? {}
            : { campus: true }
          : floorWithoutPlan
            ? { building: currentBuilding, floor: currentFloor }
            : { building: currentBuilding }
      );
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', dropCapture, true);
    window.addEventListener('drop', drop);
    window.addEventListener('dragend', reset);
    return () => {
      window.clearTimeout(quiet);
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', dropCapture, true);
      window.removeEventListener('drop', drop);
      window.removeEventListener('dragend', reset);
    };
  }, [openImport]);

  if (!dragging) return null;
  return (
    <div className="editor-drop" aria-hidden="true">
      <div className="editor-drop__box">
        <Icon name="upload" size={32} />
        Отпустите, чтобы загрузить планы
      </div>
    </div>
  );
};
