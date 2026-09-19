import type { EditorTool } from '../../stores/editorStore';
import type { IconName } from '../UI/Icon';

/** Инструменты. Значок `null` — значок выбранного типа перехода. */
export const TOOLS: { id: EditorTool; icon: IconName | null; label: string; shortcut: string }[] = [
  { id: 'select', label: 'Выбор', shortcut: 'V', icon: 'select' },
  { id: 'node', label: 'Узел', shortcut: 'N', icon: 'plus' },
  { id: 'edge', label: 'Связь', shortcut: 'E', icon: 'link' },
  { id: 'transition', label: 'Переход', shortcut: 'T', icon: null },
  { id: 'line', label: 'Линия', shortcut: 'L', icon: 'ruler' },
];
