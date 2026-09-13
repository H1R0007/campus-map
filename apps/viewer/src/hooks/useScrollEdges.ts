import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { scrollEdges } from '../utils/scrollEdges';
import type { ScrollEdges } from '../utils/scrollEdges';

const NO_EDGES: ScrollEdges = Object.freeze({ start: false, end: false });

/**
 * Края горизонтальной ленты, за которыми есть скрытое содержимое
 * (`scrollEdges`).
 *
 * Пересчитывается при прокрутке и при изменении размеров ленты и её
 * содержимого: смена языка меняет длину названий, поворот телефона — ширину.
 *
 * @param enabled лента сейчас в разметке; пока её нет, следить не за чем
 */
export function useScrollEdges(ref: RefObject<HTMLElement>, enabled: boolean): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>(NO_EDGES);

  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) {
      setEdges(NO_EDGES);
      return;
    }

    const update = () => {
      const next = scrollEdges(element.scrollLeft, element.clientWidth, element.scrollWidth);
      // Новый объект на каждое событие прокрутки перерисовывал бы шапку зря.
      setEdges((current) => (current.start === next.start && current.end === next.end ? current : next));
    };

    update();
    element.addEventListener('scroll', update, { passive: true });

    // Ширину содержимого меняет не сама лента, а её дочерний ряд чипов.
    const observer = new ResizeObserver(update);
    observer.observe(element);
    for (const child of Array.from(element.children)) observer.observe(child);

    return () => {
      element.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [ref, enabled]);

  return edges;
}
