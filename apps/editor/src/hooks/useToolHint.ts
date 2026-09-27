import { TRANSITION_LABELS, nodePlaceLabel, nodeTitle } from '../utils/labels';
import { STACK_TRANSITIONS } from '../stores/editor/editSlice';
import { visibleKinds } from '../utils/placeKinds';
import { useEditorStore } from '../stores/editorStore';

/**
 * Что делает инструмент и какие клавиши у него есть — для строки состояния
 * (запись 60). Над картой — только сам инструмент и его параметры: длинная
 * фраза там закрывала место и читалась как абзац.
 *
 * @returns подсказка или `null` вне «Разметки»
 */
export function useToolHint(): string | null {
  const workspace = useEditorStore((s) => s.workspace);
  const activeTool = useEditorStore((s) => s.activeTool);
  const selected = useEditorStore((s) => s.selectedNodeIds.size);
  const placeKinds = useEditorStore((s) => s.placeKinds);
  const activeKindId = useEditorStore((s) => s.activeKindId);
  const chainLastNodeId = useEditorStore((s) => s.chainLastNodeId);
  const edgeStartNodeId = useEditorStore((s) => s.edgeStartNodeId);
  const transitionType = useEditorStore((s) => s.transitionType);
  const transitionStart = useEditorStore((s) => (s.transitionStartNodeId ? s.nodes.get(s.transitionStartNodeId) : undefined));
  const lineStart = useEditorStore((s) => s.lineTool.start !== null);
  const lineEnd = useEditorStore((s) => s.lineTool.end !== null);
  const aliases = useEditorStore((s) => s.aliases);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);

  if (workspace !== 'markup') return null;

  switch (activeTool) {
    case 'select':
      return selected > 0
        ? 'Стрелки — сдвинуть · Delete — удалить · Ctrl+D — дублировать · Esc — снять выбор'
        : 'Щелчок — выбрать · перетащить — сдвинуть · Shift и протянуть — рамка · правая кнопка — меню';
    case 'node': {
      const kind = visibleKinds(placeKinds).find((item) => item.id === activeKindId);
      if (!kind) return 'Выберите вид точки над картой';
      if (kind.chain) {
        return chainLastNodeId
          ? `Линия «${kind.name}»: щелчок — следующая точка · Enter или Esc — закончить`
          : `Щелчки ведут линию «${kind.name}»: каждая точка связана с предыдущей · 1–8 — другой вид`;
      }
      return `Щелчок — точка «${kind.name}» · Shift — связать с предыдущей · Alt — без выравнивания · 1–8 — вид`;
    }
    case 'edge':
      return edgeStartNodeId
        ? `Щёлкните вторую точку — связь с «${nodeTitle(edgeStartNodeId, aliases)}» · Esc — отмена`
        : 'Щёлкните первую точку, затем вторую — между ними появится связь';
    case 'transition':
      if (transitionStart) {
        return `${TRANSITION_LABELS[transitionType]} от «${nodeTitle(transitionStart.id, aliases)}» (${nodePlaceLabel(transitionStart, buildingMetas)}): откройте другой план и щёлкните вторую точку · Esc — отмена`;
      }
      return STACK_TRANSITIONS.includes(transitionType)
        ? 'Щелчок по пустому месту — на всех этажах корпуса · по точке — вручную: точка, другой план, вторая точка'
        : 'Щёлкните точку, откройте другой план и щёлкните вторую точку';
    case 'line':
      return !lineStart ? 'Щелчок — начало ряда' : !lineEnd ? 'Щелчок — конец ряда' : 'Точки встанут на равном расстоянии · «Создать» над картой';
    default:
      return null;
  }
}
