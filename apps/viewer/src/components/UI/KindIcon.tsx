import React from 'react';

interface KindIconProps {
  /** Картинка значка из каталога видов — адрес `data:` (SVG или PNG). */
  image: string;
  size: number;
}

/**
 * Значок вида места из данных.
 *
 * Картинка — маска, цвет — цвет текста вокруг: значок подстраивается под
 * тёмную тему и нажатую кнопку, как встроенные значки. Скрипт в картинке
 * так не выполнится никогда: маска только рисует.
 */
export const KindIcon: React.FC<KindIconProps> = ({ image, size }) => (
  <span
    aria-hidden="true"
    className="inline-block flex-shrink-0 bg-current"
    style={{
      width: size,
      height: size,
      WebkitMaskImage: `url("${image}")`,
      maskImage: `url("${image}")`,
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
    }}
  />
);
