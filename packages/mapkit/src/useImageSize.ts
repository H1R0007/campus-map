import { useEffect, useState } from 'react';

/** Размер растровой карты в пикселях. */
export interface ImageSize {
  width: number;
  height: number;
}

/** Размер по умолчанию, если изображение недоступно. */
export const FALLBACK_IMAGE_SIZE: ImageSize = Object.freeze({ width: 1200, height: 800 });

/**
 * Определяет реальный размер изображения по его URL.
 *
 * Размер карты нельзя хранить только в метаданных: `meta.json` описывает
 * структуру кампуса, а пиксельная геометрия принадлежит самому файлу. При
 * замене тестовых планов на официальные координаты узлов останутся
 * согласованными с картинкой без правки метаданных.
 *
 * До загрузки и при ошибке возвращается `fallback`, поэтому карта
 * рендерится сразу и не «прыгает» на пустом месте. При смене `url` размер
 * сбрасывается на резервный: показывать габариты предыдущего этажа хуже,
 * чем на кадр вернуться к резервным.
 *
 * Зависимости эффекта — примитивы, а не объект `fallback`, чтобы вызывающая
 * сторона могла передавать литерал без риска бесконечного цикла.
 */
export function useImageSize(url: string, fallback: ImageSize = FALLBACK_IMAGE_SIZE): ImageSize {
  const fallbackWidth = fallback.width;
  const fallbackHeight = fallback.height;

  const [size, setSize] = useState<ImageSize>({
    width: fallbackWidth,
    height: fallbackHeight,
  });

  useEffect(() => {
    let cancelled = false;

    setSize({ width: fallbackWidth, height: fallbackHeight });

    const image = new Image();

    image.onload = () => {
      if (cancelled) return;
      // Нулевые размеры означают битый или пустой файл — оставляем резерв.
      setSize(
        image.width > 0 && image.height > 0
          ? { width: image.width, height: image.height }
          : { width: fallbackWidth, height: fallbackHeight }
      );
    };

    image.onerror = () => {
      if (!cancelled) setSize({ width: fallbackWidth, height: fallbackHeight });
    };

    image.src = url;

    return () => {
      cancelled = true;
      // Снимаем обработчики: изображение может догрузиться после размонтирования.
      image.onload = null;
      image.onerror = null;
    };
  }, [url, fallbackWidth, fallbackHeight]);

  return size;
}
