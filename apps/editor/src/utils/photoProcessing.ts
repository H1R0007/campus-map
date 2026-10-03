/**
 * Снимок с телефона → фото точки (запись 87): полное и маленькое, в WebP.
 *
 * Снимок весит 3–8 МБ и несёт метаданные: место съёмки, модель телефона,
 * время. Фото рисуется заново на холсте, поэтому метаданные в него не
 * попадают; поворот снимка («телефон держали боком») браузер учитывает при
 * чтении. Снимок не увеличивается: маленький так и остаётся маленьким.
 *
 * Вес ограничен: не уложилось — качество снижается ступенями. Опыт на
 * настоящих фото (предложение 1 октября): 1600 px в WebP — 50–180 КБ,
 * 640 px — 15–30 КБ, сжатие одного снимка — 0,2–0,4 с.
 */

/** Полное фото — во весь экран телефона и монитора. */
export const FULL_SIDE = 1600;
export const FULL_BUDGET = 250 * 1024;

/** Маленькое — в карточке, на шаге и в списках. */
export const SMALL_SIDE = 640;
export const SMALL_BUDGET = 60 * 1024;

/** Ступени качества: первое, что уложилось в вес. */
const QUALITIES = [0.8, 0.7, 0.6, 0.5];

export interface ProcessedPhoto {
  /** Имя полного фото: 16 знаков SHA-256 и формат. */
  file: string;
  width: number;
  height: number;
  full: Blob;
  small: Blob;
  /** Исходный снимок и его имя в `data-sources/`: отпечаток и формат. */
  original: Blob;
  originalName: string;
}

/** Размер, вписанный в квадрат `side`, без увеличения. */
export function fitWithin(width: number, height: number, side: number): { width: number; height: number } {
  const scale = Math.min(1, side / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Первое сжатие, уложившееся в вес; не уложилось ни одно — самое лёгкое.
 *
 * @param encode сжимает с качеством от 0 до 1
 */
export async function encodeWithin(encode: (quality: number) => Promise<Blob>, budget: number): Promise<Blob> {
  let lightest: Blob | null = null;
  for (const quality of QUALITIES) {
    const blob = await encode(quality);
    if (blob.size <= budget) return blob;
    if (lightest === null || blob.size < lightest.size) lightest = blob;
  }
  return lightest!;
}

/** Расширение файла по типу: WebP, а где браузер его не пишет (Safari) — JPEG. */
export function extensionOf(type: string): 'webp' | 'jpg' | 'png' {
  if (type === 'image/webp') return 'webp';
  if (type === 'image/png') return 'png';
  return 'jpg';
}

async function sha256Prefix(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Расширение исходника по типу файла: в имя исходника идут только разрешённые форматы. */
function originalExtension(file: Blob): string {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

/** Почему снимок не открылся — человеку. */
export class PhotoReadError extends Error {}

async function render(bitmap: ImageBitmap, side: number, budget: number): Promise<{ blob: Blob; width: number; height: number }> {
  const size = fitWithin(bitmap.width, bitmap.height, side);
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext('2d');
  if (!context) throw new PhotoReadError('Браузер не дал холст для сжатия фото');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  const blob = await encodeWithin(async (quality) => {
    const webp = await canvas.convertToBlob({ type: 'image/webp', quality });
    // Браузер без WebP вернёт PNG — для фото он в разы тяжелее, нужен JPEG.
    return webp.type === 'image/webp' ? webp : canvas.convertToBlob({ type: 'image/jpeg', quality });
  }, budget);
  return { blob, ...size };
}

/**
 * Сжимает снимок в два размера.
 *
 * @throws PhotoReadError, если браузер не открыл снимок — например, HEIC с
 *         iPhone в Chrome
 */
export async function processPhoto(file: Blob): Promise<ProcessedPhoto> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoReadError(
      'Браузер не открыл этот снимок. Если он с iPhone (HEIC) — сохраните его как JPEG или включите на телефоне «Наиболее совместимый» формат'
    );
  }

  try {
    const full = await render(bitmap, FULL_SIDE, FULL_BUDGET);
    const small = await render(bitmap, SMALL_SIDE, SMALL_BUDGET);
    const file16 = await sha256Prefix(full.blob);
    const ext = extensionOf(full.blob.type);
    return {
      file: `${file16}.${ext}`,
      width: full.width,
      height: full.height,
      full: full.blob,
      // Маленькое того же формата, что полное: браузер пишет оба одинаково.
      small: small.blob,
      original: file,
      originalName: `${await sha256Prefix(file)}.${originalExtension(file)}`,
    };
  } finally {
    bitmap.close();
  }
}
