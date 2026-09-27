import type { MapSize } from '@campus-map/core';
import { roomNumberClue } from './guess';
import type { Clue } from './guess';
import { rotatedPage } from './planGeometry';
import type { Box } from './trim';
import { composeSvgPlan, dxfToSvg, svgPageSize } from './vector';
import { PDF_POINT_METERS, drawingScaleFrom, dxfUnitMeters, tiffPixelMeters } from './scale';
import type { DxfEntity } from './vector';

/**
 * Чтение присланных файлов в листы (запись 48).
 *
 * Лист — одна страница: PDF и TIFF бывают многостраничными, архив ZIP
 * раскрывается в свои файлы. У каждого листа — размер в его единицах
 * (пункты PDF, пиксели картинки, единицы чертежа), подсказки для догадки и
 * способ нарисовать любую его область в любом масштабе и повороте.
 *
 * Тяжёлые библиотеки — pdf.js, UTIF, разбор DXF, JSZip — загружаются только
 * при первом файле своего формата.
 */

export type SheetKind = 'pdf' | 'image' | 'tiff' | 'svg' | 'dxf';

/** Подпись на листе с положением в единицах листа — номера помещений и заголовки. */
export interface SheetLabel {
  text: string;
  x: number;
  y: number;
}

export interface ImportSheet {
  id: string;
  /** Как файл назывался у присылавшего: «Корпус А.pdf», «plany.zip › Планы/x.png». */
  name: string;
  /** Файл-исходник: для архива — файл внутри него. */
  blob: Blob;
  /** Расширение исходника в нижнем регистре: pdf, png, jpg, tif, svg, dxf. */
  ext: string;
  /** Страница многостраничного файла, с 1. */
  page: number;
  pageCount: number;
  kind: SheetKind;
  /** Размер листа в его единицах. */
  size: MapSize;
  clues: Clue[];
  labels: SheetLabel[];
  /** SVG-текст листа — у векторных: они и остаются векторными. */
  svg?: string;
  /** У TIFF в одну краску — план из линий: такой лучше хранить в PNG. */
  bilevel?: boolean;
  /**
   * Метров в единице листа (запись 54): на бумаге — пункт PDF, точка скана
   * по его разрешению; у DXF — на местности (`realScale`).
   */
  unitMeters?: number;
  /** Чертёж в натуральную величину: единица листа — уже метры местности, без масштаба. */
  realScale?: boolean;
  /** Масштаб чертежа по надписи на листе. */
  drawingScale?: { ratio: number; text: string } | null;
  /**
   * Рисует повёрнутый лист или его область (`crop` — в единицах повёрнутого
   * листа) в масштабе `scale` точек холста на единицу листа.
   */
  render: (rotation: number, crop: Box | null, scale: number) => Promise<HTMLCanvasElement>;
}

export interface ReadProblem {
  name: string;
  problem: string;
}

/** Что редактор читает: расширение → вид листа. */
const KINDS: Record<string, SheetKind> = {
  pdf: 'pdf',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  bmp: 'image',
  tif: 'tiff',
  tiff: 'tiff',
  svg: 'svg',
  dxf: 'dxf',
};

/** Что сказать о формате, который не читается. */
const UNREADABLE: Record<string, string> = {
  dwg: 'чертёж DWG редактор не читает — попросите тот же чертёж в PDF или DXF',
  heic: 'фото с телефона в HEIC — сохраните его как JPG',
  doc: 'это документ, а не план — если план вставлен внутрь, сохраните его как PDF',
  docx: 'это документ, а не план — если план вставлен внутрь, сохраните его как PDF',
  xls: 'это таблица, а не план',
  xlsx: 'это таблица, а не план',
};

/** Какие файлы предлагать в окне выбора. */
export const IMPORT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff,.svg,.dxf,.zip';

/** Самая длинная сторона холста: больше браузер не нарисует. */
export const MAX_CANVAS_SIDE = 8192;

const extOf = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase() ?? '';

let nextId = 1;
const sheetId = () => `sheet-${nextId++}`;

/**
 * Читает присланные файлы.
 *
 * @param onProgress что сейчас читается — для строки «Читаю …»
 */
export async function readImportFiles(
  files: readonly File[],
  onProgress?: (name: string) => void
): Promise<{ sheets: ImportSheet[]; problems: ReadProblem[] }> {
  const sheets: ImportSheet[] = [];
  const problems: ReadProblem[] = [];
  for (const file of files) {
    onProgress?.(file.name);
    await readOne(file, file.name, sheets, problems, 0);
  }
  return { sheets, problems };
}

async function readOne(blob: Blob, name: string, sheets: ImportSheet[], problems: ReadProblem[], depth: number): Promise<void> {
  const ext = extOf(name);
  try {
    if (ext === 'zip') {
      if (depth > 1) return;
      await readZip(blob, name, sheets, problems, depth);
      return;
    }
    const kind = KINDS[ext];
    if (!kind) {
      problems.push({ name, problem: UNREADABLE[ext] ?? `формат «.${ext || '?'}» редактор не читает` });
      return;
    }
    const read = { pdf: readPdf, image: readImage, tiff: readTiff, svg: readSvg, dxf: readDxf }[kind];
    sheets.push(...(await read(blob, name, ext)));
  } catch (cause) {
    problems.push({ name, problem: `не прочитался: ${cause instanceof Error ? cause.message : String(cause)}` });
  }
}

async function readZip(blob: Blob, name: string, sheets: ImportSheet[], problems: ReadProblem[], depth: number) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(blob);
  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir && !/(^|\/)(__MACOSX|\.)/.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }));
  for (const entry of entries) {
    const ext = extOf(entry.name);
    // Лишнее в архиве — описи, заметки — молча пропускается.
    if (!KINDS[ext] && ext !== 'zip' && !UNREADABLE[ext]) continue;
    const inner = await entry.async('blob');
    await readOne(inner, `${name} › ${entry.name}`, sheets, problems, depth + 1);
  }
}

// ---------- общее для картинок ----------

/** Холст области повёрнутого листа: `draw` рисует лист в его единицах. */
function renderByTransform(
  size: MapSize,
  rotation: number,
  crop: Box | null,
  scale: number,
  draw: (context: CanvasRenderingContext2D) => void
): HTMLCanvasElement {
  const { size: rotated, turn } = rotatedPage(size, rotation);
  const area = crop ?? { x: 0, y: 0, ...rotated };
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.min(MAX_CANVAS_SIDE, Math.round(area.width * scale)));
  canvas.height = Math.max(1, Math.min(MAX_CANVAS_SIDE, Math.round(area.height * scale)));
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = 'high';
  context.scale(scale, scale);
  context.translate(-area.x, -area.y);
  context.transform(turn.a, turn.b, -turn.b, turn.a, turn.tx, turn.ty);
  draw(context);
  return canvas;
}

function fileClue(name: string): Clue[] {
  // Имя архива тоже подсказка: «Корпус Б.zip › 2.png».
  return name.split(' › ').map((part) => ({ text: part, origin: 'file' as const })).reverse();
}

/** Подсказки по подписям листа: самые крупные — заголовок, остальные — текст, номера помещений. */
function textClues(items: readonly { text: string; size: number }[]): Clue[] {
  const meaningful = items.filter((item) => item.text.trim().length > 1);
  if (meaningful.length === 0) return [];
  const largest = Math.max(...meaningful.map((item) => item.size));
  const title = meaningful.filter((item) => item.size >= largest * 0.9).map((item) => item.text.trim());
  const clues: Clue[] = [{ text: title.join(' ').slice(0, 200), origin: 'title' }];
  const rest = meaningful.filter((item) => item.size < largest * 0.9).map((item) => item.text.trim());
  if (rest.length > 0) clues.push({ text: rest.join(' ').slice(0, 2000), origin: 'text' });
  const rooms = roomNumberClue(meaningful.map((item) => item.text));
  if (rooms) clues.push(rooms);
  return clues;
}

// ---------- PDF ----------

type PdfModule = typeof import('pdfjs-dist');
let pdfModule: Promise<PdfModule> | null = null;

function loadPdf(): Promise<PdfModule> {
  pdfModule ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(
    ([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    }
  );
  return pdfModule;
}

async function readPdf(blob: Blob, name: string, ext: string): Promise<ImportSheet[]> {
  const pdfjs = await loadPdf();
  const document = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const sheets: ImportSheet[] = [];

  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: { text: string; size: number }[] = [];
    const labels: SheetLabel[] = [];
    for (const item of content.items) {
      if (!('str' in item) || item.str.trim() === '') continue;
      const size = Math.hypot(item.transform[2], item.transform[3]);
      items.push({ text: item.str, size });
      const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
      labels.push({ text: item.str.trim(), x, y });
    }

    sheets.push({
      id: sheetId(),
      name,
      blob,
      ext,
      page: number,
      pageCount: document.numPages,
      kind: 'pdf',
      size: { width: viewport.width, height: viewport.height },
      unitMeters: PDF_POINT_METERS,
      drawingScale: drawingScaleFrom(items.map((item) => item.text)),
      clues: [...textClues(items), ...fileClue(name)],
      labels,
      render: async (rotation, crop, scale) => {
        // pdf.js поворачивает только на прямые углы — других в интерфейсе нет.
        const area = crop ?? { x: 0, y: 0, ...rotatedPage({ width: viewport.width, height: viewport.height }, rotation).size };
        const shifted = page.getViewport({
          scale,
          rotation: (page.rotate + rotation) % 360,
          offsetX: -area.x * scale,
          offsetY: -area.y * scale,
        });
        const canvas = window.document.createElement('canvas');
        canvas.width = Math.max(1, Math.min(MAX_CANVAS_SIDE, Math.round(area.width * scale)));
        canvas.height = Math.max(1, Math.min(MAX_CANVAS_SIDE, Math.round(area.height * scale)));
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: context, viewport: shifted }).promise;
        return canvas;
      },
    });
  }
  return sheets;
}

// ---------- картинки ----------

async function readImage(blob: Blob, name: string, ext: string): Promise<ImportSheet[]> {
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  return [
    {
      id: sheetId(),
      name,
      blob,
      ext,
      page: 1,
      pageCount: 1,
      kind: 'image',
      size,
      clues: fileClue(name),
      labels: [],
      render: async (rotation, crop, scale) =>
        renderByTransform(size, rotation, crop, scale, (context) => context.drawImage(bitmap, 0, 0, size.width, size.height)),
    },
  ];
}

/** Первое значение тега TIFF: теги бывают числом, массивом и байтами. */
function tiffTag(ifd: Record<string, unknown>, name: string): number {
  const value = ifd[name];
  if (typeof value === 'number') return value;
  if (Array.isArray(value) || ArrayBuffer.isView(value)) return Number((value as ArrayLike<number>)[0]);
  return Number.NaN;
}

async function readTiff(blob: Blob, name: string, ext: string): Promise<ImportSheet[]> {
  const UTIF = (await import('utif2')).default;
  const buffer = await blob.arrayBuffer();
  const pages = UTIF.decode(buffer).filter((ifd) => tiffTag(ifd, 't256') > 0 && tiffTag(ifd, 't257') > 0);
  if (pages.length === 0) throw new Error('в файле нет изображений');

  return pages.map((ifd, index) => {
    const size = { width: tiffTag(ifd, 't256'), height: tiffTag(ifd, 't257') };
    let bitmap: Promise<ImageBitmap> | null = null;
    const decoded = () => {
      bitmap ??= (async () => {
        UTIF.decodeImage(buffer, ifd);
        const rgba = UTIF.toRGBA8(ifd);
        return createImageBitmap(new ImageData(new Uint8ClampedArray(rgba), size.width, size.height));
      })();
      return bitmap;
    };
    return {
      id: sheetId(),
      name,
      blob,
      ext,
      page: index + 1,
      pageCount: pages.length,
      kind: 'tiff' as const,
      size,
      clues: fileClue(name),
      labels: [],
      bilevel: tiffTag(ifd, 't258') === 1,
      unitMeters: tiffPixelMeters(tiffTag(ifd, 't282'), tiffTag(ifd, 't296')),
      render: async (rotation: number, crop: Box | null, scale: number) => {
        const image = await decoded();
        return renderByTransform(size, rotation, crop, scale, (context) => context.drawImage(image, 0, 0, size.width, size.height));
      },
    };
  });
}

// ---------- векторные ----------

/** Картинка из SVG-текста нужного размера: браузер рисует вектор в любом масштабе. */
async function svgImage(svg: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    // Картинка уже раскодирована — адрес ей больше не нужен.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function vectorSheet(
  blob: Blob,
  name: string,
  ext: string,
  kind: 'svg' | 'dxf',
  svg: string,
  size: MapSize,
  texts: { text: string; size: number; x: number; y: number }[],
  unitMeters?: number
): ImportSheet {
  // Для рисования — тот же лист с явным размером: у SVG без width/height
  // картинка иначе получила бы 300 × 150.
  const drawable = composeSvgPlan(svg, size, 0, null, 1).svg;
  let image: Promise<HTMLImageElement> | null = null;
  return {
    id: sheetId(),
    name,
    blob,
    ext,
    page: 1,
    pageCount: 1,
    kind,
    size,
    svg,
    ...(unitMeters !== undefined ? { unitMeters, realScale: true } : {}),
    clues: [...textClues(texts), ...fileClue(name)],
    labels: texts.map(({ text, x, y }) => ({ text, x, y })),
    render: async (rotation, crop, scale) => {
      image ??= svgImage(drawable);
      const loaded = await image;
      return renderByTransform(size, rotation, crop, scale, (context) => context.drawImage(loaded, 0, 0, size.width, size.height));
    },
  };
}

async function readSvg(blob: Blob, name: string, ext: string): Promise<ImportSheet[]> {
  const text = await blob.text();
  const size = svgPageSize(text);
  if (!size) throw new Error('у SVG нет размера — ни width/height, ни viewBox');
  // Подписи плана: <text> с размером шрифта, если он указан.
  const texts: { text: string; size: number; x: number; y: number }[] = [];
  for (const match of text.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)) {
    const attributes = match[1];
    const content = match[2].replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
    if (!content) continue;
    const number = (attribute: string) => Number.parseFloat(new RegExp(String.raw`\s${attribute}\s*=\s*["']([^"']*)`, 'i').exec(attributes)?.[1] ?? '');
    const fontSize = number('font-size') || Number.parseFloat(/font-size\s*:\s*([\d.]+)/i.exec(attributes)?.[1] ?? '') || 12;
    texts.push({ text: content, size: fontSize, x: number('x') || 0, y: number('y') || 0 });
  }
  return [vectorSheet(blob, name, ext, 'svg', text, size, texts)];
}

async function readDxf(blob: Blob, name: string, ext: string): Promise<ImportSheet[]> {
  const { default: DxfParser } = await import('dxf-parser');
  const parsed = new DxfParser().parseSync(await blob.text());
  const drawing = dxfToSvg((parsed?.entities ?? []) as DxfEntity[]);
  if (!drawing) throw new Error('в чертеже нет линий и подписей');
  return [
    vectorSheet(
      blob,
      name,
      ext,
      'dxf',
      drawing.svg,
      drawing.size,
      drawing.texts.map((text) => ({ text: text.text, size: text.height, x: text.x, y: text.y })),
      dxfUnitMeters((parsed as { header?: Record<string, unknown> } | null)?.header?.$INSUNITS)
    ),
  ];
}

/** Как назвать лист человеку: «Корпус А.pdf, лист 2». */
export function displayName(sheet: Pick<ImportSheet, 'name' | 'page' | 'pageCount'>): string {
  return sheet.pageCount > 1 ? `${sheet.name}, лист ${sheet.page}` : sheet.name;
}
