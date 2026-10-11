import { forwardRef } from 'react';
import type { PointPhoto } from '@campus-map/core';
import { photoSrc } from '../../utils/photos';

interface PhotoThumbProps {
  photo: PointPhoto;
  /** Сколько всего фото у точки: больше одного — число в уголке. */
  count: number;
  /** Подпись для диктора: чьё фото откроется. */
  label: string;
  onOpen: () => void;
  /** Маленькое фото не загрузилось (нет связи и оно не сохранено) — вместо миниатюры показать прежнее. */
  onUnavailable: () => void;
  className?: string;
}

/**
 * Миниатюра фото точки — кнопка: нажатие открывает фото во весь экран
 * (запись 85). Берёт маленькое фото — то же, что навигатор загружает заранее
 * для маршрута.
 */
export const PhotoThumb = forwardRef<HTMLButtonElement, PhotoThumbProps>(
  ({ photo, count, label, onOpen, onUnavailable, className = '' }, ref) => (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      aria-label={label}
      title={label}
      data-photo-thumb
      className={`relative flex-shrink-0 overflow-hidden rounded-xl bg-gray-100 ring-1 ring-black/10 hover:ring-2 hover:ring-primary focus-visible:ring-2 focus-visible:ring-primary transition-shadow ${className}`}
    >
      <img src={photoSrc(photo, 'small')} alt="" decoding="async" onError={onUnavailable} className="w-full h-full object-cover" />
      {count > 1 && (
        <span aria-hidden="true" className="absolute right-1 bottom-1 rounded-md bg-black/70 px-1.5 text-[11px] font-semibold leading-5 text-white">
          {count}
        </span>
      )}
    </button>
  )
);
PhotoThumb.displayName = 'PhotoThumb';
