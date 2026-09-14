import React from 'react';
import type { PlaceCategory, TransitionType } from '@campus-map/core';
import { TRANSITION_COLORS, TransitionGlyph } from '@campus-map/mapkit';
import { Icon } from './Icon';

interface PlaceIconProps {
  /** Тип перехода, если место — лестница, лифт, вход или переход; иначе `null`. */
  transition: TransitionType | null;
  /** Категория места: туалет, еда, гардероб, выход — значок категории вместо метки. */
  category?: PlaceCategory | null;
  size?: 'md' | 'lg';
}

/**
 * Значок места: у точки перехода — значок и цвет её типа, как на плане; у
 * помещения — значок категории (туалет, еда, гардероб, выход) или метка в
 * фирменном цвете. Декоративный: что это за место, говорит
 * подпись рядом.
 */
export const PlaceIcon: React.FC<PlaceIconProps> = ({ transition, category = null, size = 'md' }) => {
  const box = size === 'lg' ? 'w-11 h-11' : 'w-9 h-9';

  if (transition !== null) {
    return (
      <span
        aria-hidden="true"
        className={`${box} flex-shrink-0 rounded-full flex items-center justify-center text-white`}
        style={{ backgroundColor: TRANSITION_COLORS[transition] }}
      >
        <TransitionGlyph type={transition} size={size === 'lg' ? 20 : 16} />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${box} flex-shrink-0 rounded-full flex items-center justify-center bg-selected text-accent`}
    >
      <Icon name={category ?? 'pin'} size={size === 'lg' ? 22 : 18} />
    </span>
  );
};
