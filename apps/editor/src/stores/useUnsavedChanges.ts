import { useEditorStore } from './editorStore';
import { useHistoryStore } from './historyStore';

/**
 * Есть ли правки, которых нет в сохранённых данных.
 *
 * Считается сравнением состояния истории с тем, что было сохранено, а не
 * отдельным флагом: флаг оставался поднятым и после того, как человек отменил
 * все свои правки, и строка состояния врала.
 */
export function useUnsavedChanges(): boolean {
  const savedStateId = useEditorStore((s) => s.savedStateId);
  const stateId = useHistoryStore((h) => h.stateId());
  return stateId !== savedStateId;
}
