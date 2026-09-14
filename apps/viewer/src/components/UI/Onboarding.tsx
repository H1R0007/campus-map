import React, { useRef, useState } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { messagesFor, useLanguage } from '../../i18n';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { LanguageSwitch } from './LanguageSwitch';

/** Экраны знакомства — по главным сценариям студента. */
const SLIDES = [
  { key: 'search', icon: 'search' },
  { key: 'qr', icon: 'qr' },
  { key: 'steps', icon: 'start' },
] as const satisfies readonly { key: string; icon: IconName }[];

const TEXT_ID = 'onboarding-text';

interface OnboardingProps {
  /** Знакомство пройдено или пропущено. */
  onClose: () => void;
}

/**
 * Знакомство при первом запуске: три коротких экрана о главном (запись 25) —
 * найти место, QR-код у входа как «вы здесь», идти по шагам.
 *
 * Диалог (`useDialogFocus`): Escape и «Пропустить» закрывают его сразу, фокус
 * начинается на «Далее». Переключатель языка — в самом диалоге: иностранный
 * студент видит его первым, до того как прочтёт хоть слово по-русски. Смену
 * экрана диктору объявляет область `aria-live`.
 */
export const Onboarding: React.FC<OnboardingProps> = ({ onClose }) => {
  const [index, setIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const language = useLanguage();
  const messages = messagesFor(language);

  useDialogFocus(dialogRef, true, onClose);

  const slide = SLIDES[index];
  const content = messages.onboarding.slides[slide.key];
  const isLast = index === SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={messages.onboarding.label}
        aria-describedby={TEXT_ID}
        className="w-full rounded-t-3xl bg-surface px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-3xl sm:pb-5"
      >
        <div className="flex items-center justify-between gap-2">
          <LanguageSwitch />
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 h-11 px-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            {messages.onboarding.skip}
          </button>
        </div>

        <div className="mt-6 flex flex-col items-center text-center" aria-live="polite" aria-atomic="true">
          <span
            aria-hidden="true"
            className="w-20 h-20 rounded-full bg-selected text-accent flex items-center justify-center"
          >
            <Icon name={slide.icon} size={40} />
          </span>
          <p className="mt-5 text-sm font-medium text-gray-600">
            {messages.onboarding.progress(index + 1, SLIDES.length)}
          </p>
          <h2 className="mt-1 text-2xl font-bold leading-tight text-gray-900">{content.title}</h2>
          <p id={TEXT_ID} className="mt-3 text-base text-gray-700 text-balance">
            {content.text}
          </p>
        </div>

        <div aria-hidden="true" className="mt-6 flex justify-center gap-2">
          {SLIDES.map((item, i) => (
            <span
              key={item.key}
              className={`h-2 rounded-full transition-all motion-reduce:transition-none ${
                i === index ? 'w-6 bg-accent' : 'w-2 bg-gray-300'
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          // Фокус — на главном действии, а не на переключателе языка, первом в
          // диалоге: `useDialogFocus` не переводит фокус, если он уже внутри.
          autoFocus
          onClick={() => (isLast ? onClose() : setIndex(index + 1))}
          className="mt-6 w-full h-14 rounded-2xl bg-primary text-white text-lg font-semibold flex items-center justify-center gap-2 hover:bg-primary-hover transition-colors"
        >
          {isLast ? messages.onboarding.done : messages.onboarding.next}
          {!isLast && <Icon name="forward" size={22} />}
        </button>
      </div>
    </div>
  );
};
