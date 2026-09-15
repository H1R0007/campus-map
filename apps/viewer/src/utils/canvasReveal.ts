/**
 * Когда корпус на холсте показывает этаж, а не крышу (запись 32).
 *
 * Мерило — доля свободной части экрана, которую занимает длинная сторона
 * корпуса, а не пиксели: на большом мониторе порог в пикселях открывал самый
 * длинный корпус уже на самом мелком масштабе. Крыша закрыта большую часть
 * масштабов и тает, только когда корпус занимает заметную часть экрана.
 */

/** С этой доли крыша начинает таять, а этаж — проявляться. */
export const REVEAL_START_SHARE = 0.5;

/** С этой доли виден только этаж. */
export const REVEAL_END_SHARE = 0.8;

/** Корпус открыт — на карте его помещения и участки маршрута — с этой доли… */
export const REVEALED_SHARE = 0.65;

/** …и закрывается ниже этой: запас, чтобы помещения не мигали на границе. */
export const HIDDEN_SHARE = 0.55;

/** С этой доли план этажа грузится заранее: к началу проявления он уже готов. */
export const PRELOAD_SHARE = 0.3;

/** С этого масштаба на территории видны точки мест и значки входов, пикселей на метр. */
export const DETAIL_PIXELS_PER_METER = 1.5;

/** Доля свободной части экрана, которую занимает длинная сторона корпуса. */
export function screenShare(spanMeters: number, pixelsPerMeter: number, freeWidth: number, freeHeight: number): number {
  return (spanMeters * pixelsPerMeter) / Math.max(1, Math.min(freeWidth, freeHeight));
}

/** Насколько проявлен этаж: 0 — только крыша, 1 — только этаж, между ними — плавно. */
export function revealAmount(share: number): number {
  const t = Math.min(1, Math.max(0, (share - REVEAL_START_SHARE) / (REVEAL_END_SHARE - REVEAL_START_SHARE)));
  return t * t * (3 - 2 * t);
}

/** Открыт ли корпус при этой доле экрана — с запасом на закрытие. */
export function isRevealedAt(share: number, wasRevealed: boolean): boolean {
  return share >= (wasRevealed ? HIDDEN_SHARE : REVEALED_SHARE);
}

/** Ширина названия на крыше, CSS-пиксели: оценка по числу букв для шрифта надписи. */
export function roofLabelWidth(name: string): number {
  return name.length * 7.5 + 16;
}
