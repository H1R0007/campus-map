import React, { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { Icon } from './Icon';

/**
 * Файлы, брошенные на редактор, открывают окно «Планы из файлов» (запись 48).
 *
 * Пока файлы несут над окном, поверх всего — подсказка «отпустите». Корпус,
 * который открыт, подставляется листам, у которых корпус не угадан: план
 * этажа обычно бросают, стоя в его корпусе.
 */
export const ImportDropZone: React.FC = () => {
  const openImport = useEditorStore((s) => s.openImport);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current += 1;
      setDragging(true);
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const over = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const drop = (event: DragEvent) => {
      depth.current = 0;
      setDragging(false);
      if (!hasFiles(event) || event.defaultPrevented) return;
      event.preventDefault();
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length === 0) return;
      const { currentBuilding } = useEditorStore.getState();
      openImport(files, currentBuilding === null ? {} : { building: currentBuilding });
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [openImport]);

  if (!dragging) return null;
  return (
    <div className="editor-drop" aria-hidden="true">
      <div className="editor-drop__box">
        <Icon name="upload" size={32} />
        Отпустите — разберём планы
      </div>
    </div>
  );
};
