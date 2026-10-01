/**
 * Какие названия корпусов показать на холсте, чтобы они не налезали друг на
 * друга и на чужие корпуса.
 *
 * Раньше название показывалось, только если целиком помещалось на крыше. На
 * общем виде кампуса корпуса мелкие, и на первом экране не было подписано ни
 * одного: человек видел серые прямоугольники и не знал, какой из них нужен.
 * Теперь название может выйти за края своей крыши — как подпись на обычной
 * карте, — если не задевает соседние названия и чужие корпуса. В тесноте первыми
 * подписываются крупные корпуса, мелкие — при приближении.
 *
 * Всё в пикселях экрана: положения уже пересчитаны с учётом масштаба и поворота
 * карты.
 */

export interface ScreenBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface RoofLabelCandidate {
  /** Центр названия на экране — центр контура корпуса. */
  center: { x: number; y: number };
  /** Размер названия, px. */
  width: number;
  height: number;
  /** Корпус на экране: охватывающий прямоугольник его контура. */
  box: ScreenBox;
  /** Чем больше, тем раньше название получает место: длина корпуса. */
  priority: number;
  /** Название вообще претендует на место: корпус не открыт настолько, что крыша растаяла. */
  wanted: boolean;
}

/** Зазор между соседними названиями, px. */
export const LABEL_GAP = 6;

/** Высота строки названия, px: шрифт 13 px с ореолом. */
export const ROOF_LABEL_HEIGHT = 20;

/**
 * Ширина текста названия, px: оценка по числу букв для шрифта надписи. Без
 * полей — поля нужны, чтобы решить, помещается ли название на крыше
 * (`roofLabelWidth`), а столкновения считаются по самим буквам.
 */
export function roofLabelTextWidth(name: string): number {
  return name.length * 7.5;
}

function labelBox(candidate: RoofLabelCandidate, grow: number): ScreenBox {
  const halfWidth = candidate.width / 2 + grow;
  const halfHeight = candidate.height / 2 + grow;
  return {
    minX: candidate.center.x - halfWidth,
    maxX: candidate.center.x + halfWidth,
    minY: candidate.center.y - halfHeight,
    maxY: candidate.center.y + halfHeight,
  };
}

function overlaps(a: ScreenBox, b: ScreenBox): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
}

/**
 * Видимость названий, в порядке кандидатов.
 *
 * Название не показывается, если задевает уже показанное (с зазором
 * `LABEL_GAP`) или контур другого корпуса. Свой корпус ему не мешает.
 */
export function placeRoofLabels(candidates: readonly RoofLabelCandidate[]): boolean[] {
  const visible = candidates.map(() => false);
  const order = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.wanted)
    .sort((a, b) => b.candidate.priority - a.candidate.priority || a.index - b.index);

  const placed: ScreenBox[] = [];
  for (const { candidate, index } of order) {
    const own = labelBox(candidate, 0);
    const spaced = labelBox(candidate, LABEL_GAP / 2);
    if (placed.some((box) => overlaps(spaced, box))) continue;
    if (candidates.some((other, otherIndex) => otherIndex !== index && overlaps(own, other.box))) continue;

    visible[index] = true;
    placed.push(labelBox(candidate, LABEL_GAP / 2));
  }
  return visible;
}
