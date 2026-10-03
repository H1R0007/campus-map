import { photoPath } from '@campus-map/core';
import type { PhotoSize, PointPhoto } from '@campus-map/core';
import { DATA_BASE_URL } from '../config/dataBase';
import { heldPhotoFile, holdFile, holdPhotoFile } from './planFiles';
import type { ProcessedPhoto } from './photoProcessing';

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
