/**
 * Запись алиаса в JSON
 */
export interface AliasEntry {
  /** ID узла */
  id: string;
  
  /** Одно имя */
  name?: string;
  
  /** Несколько имён */
  names?: string[];
}

/**
 * Подсказка поиска
 */
export interface SearchSuggestion {
  /** Отображаемый текст */
  alias: string;
  
  /** ID узла */
  id: string;
  
  /** Оценка релевантности (больше = лучше) */
  score: number;
}