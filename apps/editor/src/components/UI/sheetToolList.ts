import type { IconName } from './Icon';

/**
 * Инструменты мастерской листов (запись 81): какие есть, их значки, буквы
 * и подсказки. Панель и меню — в `SheetTools.tsx`, жесты — в `SheetCanvas`.
 */

export type SheetTool = 'select' | 'hand' | 'polygon' | 'rect' | 'cut' | 'building';

export interface ToolInfo {
  tool: SheetTool;
  icon: IconName;
  label: string;
  /** Буква на клавиатуре и физическая клавиша: в русской раскладке буква другая. */
  key: string;
  code: string;
  /** Что делает — в подсказке и под указателем. */
  does: string;
}

export const TOOLS: readonly ToolInfo[] = [
  { tool: 'select', icon: 'pointer', label: 'Выбор', key: 'V', code: 'KeyV', does: 'тянуть углы, края и рамку' },
  { tool: 'hand', icon: 'hand', label: 'Рука', key: 'H', code: 'KeyH', does: 'двигать лист' },
  { tool: 'polygon', icon: 'polygon', label: 'Контур по точкам', key: 'P', code: 'KeyP', does: 'обвести здание щелчками по углам' },
  { tool: 'rect', icon: 'square', label: 'Прямоугольник', key: 'R', code: 'KeyR', does: 'обвести план рамкой' },
  { tool: 'cut', icon: 'scissors', label: 'Вырезать', key: 'X', code: 'KeyX', does: 'вырезать штамп или надпись прямоугольником' },
  { tool: 'building', icon: 'target', label: 'Здание здесь', key: 'B', code: 'KeyB', does: 'щёлкнуть по зданию — контур найдётся вокруг него' },
];

/** Подсказка внизу листа: что делать этим инструментом. */
export const TOOL_HINTS: Record<Exclude<SheetTool, 'select'>, string> = {
  hand: 'Тяните лист мышью · колесо — масштаб · V — к выбору',
  polygon:
    'Щёлкайте по углам здания по порядку · Shift — ровно по горизонтали, вертикали или 45° · щелчок по первой точке, двойной щелчок или Enter — замкнуть · Backspace — убрать последнюю · Esc — отменить',
  rect: 'Растяните прямоугольник вокруг плана — он станет областью · Esc — к выбору',
  cut: 'Растяните прямоугольник по штампу или надписи, начиная за линией контура, — он вырежется из плана · Esc — к выбору',
  building: 'Щёлкните по зданию — контур найдётся вокруг него · Esc — к выбору',
};
