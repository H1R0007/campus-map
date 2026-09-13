/**
 * Движение по списку подсказок стрелками.
 *
 * По кругу: «вниз» с последней подсказки ведёт на первую, «вверх» с первой —
 * на последнюю. `-1` — ни одна подсказка не выбрана: так список выглядит,
 * пока человек только печатает, и «вверх» из этого состояния ведёт на
 * последнюю, как в поиске браузера.
 *
 * @returns индекс выбранной подсказки; `-1`, если подсказок нет
 */
export function moveActiveOption(index: number, count: number, direction: 'up' | 'down'): number {
  if (count <= 0) return -1;
  if (direction === 'down') return index < 0 || index >= count - 1 ? 0 : index + 1;
  return index <= 0 || index >= count ? count - 1 : index - 1;
}
