import React from 'react';
import { TRANSITION_COLORS, TransitionGlyph } from '@campus-map/mapkit';
import type { RouteStep } from '../../utils/routeInstructions';
import { Icon } from './Icon';

interface RouteStepIconProps {
  step: RouteStep;
  /** Последний шаг ведёт к цели — пеший он или «Вы на месте». */
  isLast: boolean;
  size?: 'md' | 'lg';
}

/**
 * Значок шага — тем же, чем его место отмечено на карте: начало и цель —
 * цветами концов маршрута, переход — значком и цветом своего типа, пеший
 * участок — стрелкой. Декоративный: шаг называет текст рядом.
 *
 * Один компонент для списка шагов и для карточки текущего шага: значок в
 * списке и на карточке обязан совпадать.
 */
export const RouteStepIcon: React.FC<RouteStepIconProps> = ({ step, isLast, size = 'md' }) => {
  const box = `relative ${size === 'lg' ? 'w-11 h-11' : 'w-6 h-6'} rounded-full flex items-center justify-center flex-shrink-0`;
  const glyph = size === 'lg' ? 22 : 14;

  if (step.kind === 'start' || isLast) {
    return (
      <span aria-hidden="true" className={`${box} ${step.kind === 'start' ? 'bg-start' : 'bg-primary'}`}>
        <span className={`${size === 'lg' ? 'w-3.5 h-3.5' : 'w-2 h-2'} rounded-full bg-white`} />
      </span>
    );
  }

  if (step.kind === 'transition' && step.transition !== null) {
    return (
      <span aria-hidden="true" className={`${box} text-white`} style={{ backgroundColor: TRANSITION_COLORS[step.transition] }}>
        <TransitionGlyph type={step.transition} size={glyph} />
      </span>
    );
  }

  return (
    <span aria-hidden="true" className={`${box} bg-gray-100 text-gray-600`}>
      <Icon name="walk" size={glyph} />
    </span>
  );
};
