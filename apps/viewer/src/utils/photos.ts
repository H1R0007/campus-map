import type { Graph, PhotoSize, PointPhoto } from '@campus-map/core';
import { photoUrl } from '@campus-map/core';
import { DATA_BASE_URL } from '../config/dataBase';

/**
 * Фото точек в навигаторе (запись 85): в карточке места, на шаге маршрута и во
 * весь экран.
 */

const NO_PHOTOS: readonly PointPhoto[] = Object.freeze([]);

/** Фото точки; без точки или без фото — общий пустой список. */
export function pointPhotos(graph: Graph | null | undefined, nodeId: string | null | undefined): readonly PointPhoto[] {
  if (!graph || !nodeId) return NO_PHOTOS;
  return graph.getNode(nodeId)?.photos ?? NO_PHOTOS;
}

/** Адрес фото нужного размера с учётом базового пути развёртывания. */
export function photoSrc(photo: PointPhoto, size: PhotoSize): string {
  return photoUrl(photo.file, size, DATA_BASE_URL);
}

/**
 * Маленькие фото точек, к которым ведут шаги маршрута, — без повторов, в
 * порядке шагов. Их навигатор загружает заранее вместе с планами (запись 26):
 * маршрут строят у входа, а идут по нему там, где связи нет. Полные фото —
 * только по нажатию: их на маршруте никто не смотрит все.
 */
export function routePhotoUrls(graph: Graph, subjects: readonly (string | null)[]): string[] {
  const urls = new Set<string>();
  for (const subject of subjects) {
    const [main] = pointPhotos(graph, subject);
    if (main) urls.add(photoSrc(main, 'small'));
  }
  return [...urls];
}

/**
 * Размер фото, вписанного в область целиком: по ширине или по высоте.
 */
export function containSize(
  photo: Pick<PointPhoto, 'width' | 'height'>,
  box: { width: number; height: number }
): { width: number; height: number } {
  if (box.width <= 0 || box.height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(box.width / photo.width, box.height / photo.height);
  return { width: Math.round(photo.width * scale), height: Math.round(photo.height * scale) };
}
