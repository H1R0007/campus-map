import { forwardRef } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';

interface IconButtonProps {
  icon: IconName;
  /** Что делает кнопка — для экранного диктора и всплывающей подсказки. */
  label: string;
  onClick: () => void;
  className?: string;
}

/**
 * Круглая кнопка со значком. 44 px — минимальная цель нажатия (запись 15), даже
 * если значок мельче.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, onClick, className = '' },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`w-11 h-11 flex-shrink-0 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors ${className}`}
    >
      <Icon name={icon} />
    </button>
  );
});
