import { photoPath } from '@campus-map/core';
import type { PhotoSize, PointPhoto } from '@campus-map/core';
import { DATA_BASE_URL } from '../config/dataBase';
import { fetchSourceFile } from './diskStore';
import { heldPhotoFile, holdFile, holdPhotoFile } from './planFiles';
import type { ProcessedPhoto } from './photoProcessing';
import { heldSource } from './saveFiles';

/**
 * Где фото точки, которое видит редактор (запись 87): только что добавленное —
 * в памяти до «Сохранить», сохранённое — в данных или в общей папке фото, и
 * сервер разработки отдаёт его по тому же адресу.
 */

const objectUrls = new Map<string, string>();

/** Имя файла фото нужного размера в каталоге фото. */
export function photoFileName(photo: Pick<PointPhoto, 'file'>, size: PhotoSize): string {
  return photoPath(photo.file, size).split('/').slice(1).join('/');
}

/**
 * Адрес фото для показа в редакторе или `null`, если его нет ни в памяти, ни
 * на диске: добавлено на другой машине, а общая папка ещё не синхронизирована.
 *
 * @param onDisk файлы фото, которые есть в данных и общей папке; `null` — неизвестно
 *        (редактор не из репозитория): тогда фото ищется по адресу данных
 */
export function photoSrc(photo: Pick<PointPhoto, 'file'>, size: PhotoSize, onDisk: ReadonlySet<string> | null): string | null {
  const name = photoFileName(photo, size);
  const held = heldPhotoFile(name);
  if (held) {
    let url = objectUrls.get(name);
    if (!url) {
      url = URL.createObjectURL(held.blob);
      objectUrls.set(name, url);
    }
    return url;
  }
  if (onDisk !== null && !onDisk.has(name)) return null;
  return `${DATA_BASE_URL}/${photoPath(photo.file, size)}`;
}

/** Кладёт сжатое фото и исходный снимок в память редактора до сохранения. */
export async function holdProcessedPhoto(processed: ProcessedPhoto): Promise<void> {
  await holdPhotoFile(processed.full, processed.file);
  await holdPhotoFile(processed.small, photoFileName({ file: processed.file }, 'small'));
  await holdFile(processed.original);
}

/**
 * С чего размывать фото (запись 88): с исходного снимка — так фото не
 * теряет качества, а убранная рамка возвращает место как было; нет снимка на
 * этой машине — с самого фото, и то, что уже размыто, остаётся размытым.
 */
export interface BlurBase {
  blob: Blob;
  kind: 'original' | 'photo';
}

async function fetchBlob(url: string): Promise<Blob | null> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    return response.ok ? await response.blob() : null;
  } catch {
    return null;
  }
}

/**
 * `null` — нет ни снимка, ни фото: файл ещё не пришёл из общей папки.
 *
 * @param diskSources исходники в `data-sources/` этой машины; `null` — редактор
 *        открыт не из репозитория, исходников ему не прочесть
 */
export async function blurBaseOf(
  photo: PointPhoto,
  onDisk: ReadonlySet<string> | null,
  diskSources: ReadonlySet<string> | null
): Promise<BlurBase | null> {
  if (photo.source) {
    const held = heldSource(photo.source);
    if (held) return { blob: held.blob, kind: 'original' };
    const fetched = diskSources?.has(photo.source) ? await fetchSourceFile(photo.source) : null;
    if (fetched) return { blob: fetched, kind: 'original' };
  }
  const held = heldPhotoFile(photoFileName(photo, 'full'));
  if (held) return { blob: held.blob, kind: 'photo' };
  const src = photoSrc(photo, 'full', onDisk);
  const fetched = src ? await fetchBlob(src) : null;
  return fetched ? { blob: fetched, kind: 'photo' } : null;
}

/**
 * Кладёт размытое фото в память и запоминает, какое фото оно заменило — и
 * всё, что заменило то: сохранение уберёт их из общей папки.
 */
export async function holdBlurredPhoto(processed: ProcessedPhoto, replaced: PointPhoto): Promise<void> {
  const previous = heldPhotoFile(photoFileName(replaced, 'full'))?.replaces ?? [];
  await holdPhotoFile(processed.full, processed.file, [replaced.file, ...previous]);
  await holdPhotoFile(processed.small, photoFileName({ file: processed.file }, 'small'));
}
