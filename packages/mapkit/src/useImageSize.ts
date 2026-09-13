import { useLayoutEffect, useState } from 'react';

/** Размер растровой карты в пикселях. */
export interface ImageSize {
  width: number;
  height: number;
}

/**
 * Состояние загрузки плана:
 *
 * - `loading` — картинка ещё грузится, размер — подсказка из данных или резервный;
 * - `ready` — размер взят из самой картинки;
 * - `error` — картинки нет: нет сети, нет файла или файл пустой.
 */
export type ImageStatus = 'loading' | 'ready' | 'error';

export interface ImageState {
  size: ImageSize;
  status: ImageStatus;
}

/** Размер, если подсказки из данных нет, а картинка не загружена или недоступна. */
export const FALLBACK_IMAGE_SIZE: ImageSize = Object.freeze({ width: 1200, height: 800 });

/** Итог загрузки конкретного URL: размер картинки либо `null`, если её нет. */
interface Loaded {
  url: string;
  size: ImageSize | null;
}

function sizeOf(image: HTMLImageElement): ImageSize | null {
  // Нулевые размеры означают битый или пустой файл — это та же недоступность.
  return image.naturalWidth > 0 && image.naturalHeight > 0
    ? { width: image.naturalWidth, height: image.naturalHeight }
    : null;
}

/**
 * Реальный размер изображения по URL и то, загружено ли оно.
 *
 * Размер карты нельзя хранить только в метаданных: `meta.json` описывает
 * структуру кампуса, а пиксельная геометрия принадлежит самому файлу. При
 * замене тестовых планов на официальные координаты узлов останутся
 * согласованными с картинкой без правки метаданных.
 *
 * Результат привязан к URL. Пока грузится новый план, возвращается подсказка
 * `fallback` со статусом `loading`, а не размер предыдущего плана: раньше
 * размер сбрасывался эффектом — уже после кадра, нарисованного со старыми
 * габаритами.
 *
 * Эффект — `useLayoutEffect`, и уже загруженная картинка (из кэша браузера)
 * распознаётся по `complete` синхронно: состояние обновляется до отрисовки, и
 * смена этажа, который уже открывали, не мигает индикатором загрузки.
 */
export function useImageSize(url: string, fallback: ImageSize): ImageState {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useLayoutEffect(() => {
    let cancelled = false;
    const image = new Image();

    const finish = () => {
      if (!cancelled) setLoaded({ url, size: sizeOf(image) });
    };

    image.onload = finish;
    image.onerror = () => {
      if (!cancelled) setLoaded({ url, size: null });
    };
    image.src = url;

    if (image.complete) finish();

    return () => {
      cancelled = true;
      // Снимаем обработчики: изображение может догрузиться после смены плана.
      image.onload = null;
      image.onerror = null;
    };
  }, [url]);

  if (loaded?.url !== url) return { size: fallback, status: 'loading' };

  return loaded.size !== null
    ? { size: loaded.size, status: 'ready' }
    : { size: fallback, status: 'error' };
}
