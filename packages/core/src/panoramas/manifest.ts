import type { Panorama } from './types.js';

/**
 * Разбор `panoramas.json`.
 *
 * Файл необязателен: датасет без панорам — обычный датасет. Битая запись
 * пропускается с предупреждением, остальные панорамы остаются: один снимок с
 * опечаткой не должен выключать экскурсию по всему корпусу.
 */

/** Путь к описанию панорам относительно корня данных. */
export const PANORAMAS_PATH = 'panoramas.json';

/**
 * Имя файла снимка: латиница, цифры, `._-`, каталоги через `/`, расширение
 * изображения. Без `..`, ведущего `/` и обратных слэшей: имя склеивается с
 * адресом хранилища, и выйти за его корень оно не должно.
 */
const FILE_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*\.(jpe?g|webp|png)$/i;

const TAKEN_AT_PATTERN = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;

export interface ParsedPanoramas {
  /** Панорамы по узлам. */
  panoramas: ReadonlyMap<string, Panorama>;
  warnings: string[];
}

/** Угол в [0, 360). */
export function normalizeDegrees(degrees: number): number {
  const value = degrees % 360;
  // `+ 0` превращает −0 в 0: иначе 0 и −0 различались бы в сравнениях тестов.
  return (value < 0 ? value + 360 : value) + 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Разбирает содержимое `panoramas.json`.
 *
 * @param raw разобранный JSON; `null` — файла нет
 * @param hasNode есть ли узел в графе. Панорама неизвестного узла
 *        пропускается: точку удалили или переименовали, а снимок остался.
 */
export function parsePanoramas(raw: unknown, hasNode: (id: string) => boolean): ParsedPanoramas {
  const panoramas = new Map<string, Panorama>();
  const warnings: string[] = [];

  if (raw === null) return { panoramas, warnings };

  if (!isRecord(raw) || !Array.isArray(raw.panoramas)) {
    warnings.push(`${PANORAMAS_PATH}: ожидался объект с массивом "panoramas" — панорамы не загружены`);
    return { panoramas, warnings };
  }

  raw.panoramas.forEach((entry: unknown, index: number) => {
    const where = `${PANORAMAS_PATH}: панорама №${index + 1}`;

    if (!isRecord(entry)) {
      warnings.push(`${where} не является объектом и пропущена`);
      return;
    }

    const node = entry.node;
    if (typeof node !== 'string' || node === '') {
      warnings.push(`${where}: нет поля "node" — пропущена`);
      return;
    }
    if (!hasNode(node)) {
      warnings.push(`${where}: узла ${node} нет в графе — пропущена`);
      return;
    }
    if (panoramas.has(node)) {
      warnings.push(`${where}: у узла ${node} уже есть панорама — вторая пропущена`);
      return;
    }

    const file = entry.file;
    if (typeof file !== 'string' || !FILE_PATTERN.test(file)) {
      warnings.push(
        `${where} (${node}): имя файла ${JSON.stringify(file)} не подходит — латиница, цифры, «._-», ` +
          'каталоги через «/», расширение jpg, webp или png; пропущена'
      );
      return;
    }

    let heading: number | null = null;
    if (typeof entry.heading === 'number' && Number.isFinite(entry.heading)) {
      heading = normalizeDegrees(entry.heading);
    } else if (entry.heading !== undefined && entry.heading !== null) {
      warnings.push(`${where} (${node}): heading должен быть числом — снимок без направления`);
    }

    let takenAt: string | null = null;
    if (typeof entry.takenAt === 'string' && TAKEN_AT_PATTERN.test(entry.takenAt)) {
      takenAt = entry.takenAt;
    } else if (entry.takenAt !== undefined) {
      warnings.push(`${where} (${node}): takenAt — ГГГГ-ММ или ГГГГ-ММ-ДД, поле пропущено`);
    }

    const { hiddenLinks, linkHeadings } = parseLinks(entry.links, `${where} (${node})`, hasNode, warnings);

    panoramas.set(node, { node, file, heading, takenAt, hiddenLinks, linkHeadings });
  });

  return { panoramas, warnings };
}

function parseLinks(
  raw: unknown,
  where: string,
  hasNode: (id: string) => boolean,
  warnings: string[]
): Pick<Panorama, 'hiddenLinks' | 'linkHeadings'> {
  const hiddenLinks = new Set<string>();
  const linkHeadings = new Map<string, number>();

  if (raw === undefined) return { hiddenLinks, linkHeadings };
  if (!isRecord(raw)) {
    warnings.push(`${where}: links должен быть объектом — поле пропущено`);
    return { hiddenLinks, linkHeadings };
  }

  if (raw.hide !== undefined) {
    if (!Array.isArray(raw.hide)) {
      warnings.push(`${where}: links.hide должен быть массивом — поле пропущено`);
    } else {
      for (const id of raw.hide) {
        if (typeof id === 'string' && hasNode(id)) hiddenLinks.add(id);
        else warnings.push(`${where}: links.hide — узла ${JSON.stringify(id)} нет в графе`);
      }
    }
  }

  if (raw.headings !== undefined) {
    if (!isRecord(raw.headings)) {
      warnings.push(`${where}: links.headings должен быть объектом — поле пропущено`);
    } else {
      for (const [id, degrees] of Object.entries(raw.headings)) {
        if (!hasNode(id)) {
          warnings.push(`${where}: links.headings — узла ${id} нет в графе`);
        } else if (typeof degrees !== 'number' || !Number.isFinite(degrees)) {
          warnings.push(`${where}: links.headings.${id} должен быть числом`);
        } else {
          linkHeadings.set(id, normalizeDegrees(degrees));
        }
      }
    }
  }

  return { hiddenLinks, linkHeadings };
}
