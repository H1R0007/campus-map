/** Края горизонтальной ленты, за которыми есть скрытое содержимое. */
export interface ScrollEdges {
  /** Слева есть что прокрутить. */
  start: boolean;
  /** Справа есть что прокрутить. */
  end: boolean;
}

/**
 * Допуск, CSS-пиксели: при масштабе страницы прокрутка дробная и до края ровно
 * не доходит — без допуска погасший край не исчезал бы в конце ленты.
 */
const EDGE_TOLERANCE_PX = 1;

/**
 * Есть ли содержимое за левым и правым краем прокручиваемой ленты.
 *
 * Лента корпусов в шапке прокручивается жестом, без полосы прокрутки, и
 * обрезанный край выглядел концом списка. Край, за которым есть ещё корпуса,
 * гаснет — это и есть признак прокрутки. Направление письма — слева направо:
 * у языков интерфейса другого нет.
 */
export function scrollEdges(scrollLeft: number, clientWidth: number, scrollWidth: number): ScrollEdges {
  return {
    start: scrollLeft > EDGE_TOLERANCE_PX,
    end: scrollLeft + clientWidth < scrollWidth - EDGE_TOLERANCE_PX,
  };
}
