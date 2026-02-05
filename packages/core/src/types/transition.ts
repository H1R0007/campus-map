/**
 * Тип перехода между узлами разных этажей/зданий
 */
export type TransitionType = 
  | 'door'     // дверь (обычный проход)
  | 'stairs'   // лестница
  | 'lift'     // лифт
  | 'bridge'   // переход между корпусами
  | 'unknown';

/**
 * Переход между двумя узлами
 */
export interface Transition {
  /** ID начального узла */
  fromNode: string;
  
  /** ID конечного узла */
  toNode: string;
  
  /** Тип перехода */
  type: TransitionType;
}

/**
 * Данные перехода в JSON-файле
 */
export interface TransitionData {
  from: { node: string };
  to: { node: string };
  transition_type?: string;
}

/**
 * Преобразование строки в TransitionType
 */
export function parseTransitionType(str: string): TransitionType {
  const normalized = str.toLowerCase().trim();
  switch (normalized) {
    case 'door': return 'door';
    case 'stairs': return 'stairs';
    case 'lift': return 'lift';
    case 'bridge': return 'bridge';
    default: return 'unknown';
  }
}

/**
 * Преобразование TransitionType в строку
 */
export function transitionTypeToString(type: TransitionType): string {
  return type;
}