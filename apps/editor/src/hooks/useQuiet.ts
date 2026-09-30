import { useEffect, useState } from 'react';

/**
 * Значение, которое догоняет исходное, когда правки прекратились.
 *
 * Перетаскивание узла меняет данные каждый кадр. Пересчёт, который стоит
 * десятки миллисекунд (проверка всего датасета, расстояния между узлами),
 * на каждом кадре съедал бы кадр целиком, и работа шла бы рывками. Тому, что
 * считается по этому значению, спешить некуда.
 */
/**
 * Пауза для счётчиков (дерево, строка состояния, обзор плана): число точек
 * во время перетаскивания не меняется, а считать его по всему кампусу на
 * каждом кадре дорого. `useDeferredValue` лишь откладывал этот счёт — и всё
 * равно выполнял его на каждом кадре.
 */
export const QUIET_COUNTS_MS = 250;

export function useQuiet<T>(value: T, delay: number): T {
  const [quiet, setQuiet] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuiet(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return quiet;
}
