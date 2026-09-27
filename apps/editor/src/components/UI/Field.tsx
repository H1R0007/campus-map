import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Поля и пояснения редактора (запись 58).
 *
 * Правило подсказок: у поля — короткая подпись; пример значения — внутри
 * пустого поля; «зачем» — за значком ⓘ, одной фразой; красная строка под
 * полем — только когда ввели не то, и она говорит, как исправить. Абзацы —
 * только на пустых экранах.
 */

/** Ширина пузыря пояснения, CSS-пиксели. */
const TIP_WIDTH = 260;

/**
 * Значок ⓘ с пояснением: открывается при наведении, фокусе и щелчке,
 * закрывается уходом мыши, Escape и щелчком мимо. Пузырь — поверх всего
 * (портал в `body`), чтобы колонка с прокруткой его не обрезала.
 *
 * @param about о чём пояснение — для чтения с экрана: «Пояснение: Номер»
 */
export const InfoTip: React.FC<{ about: string; children: React.ReactNode }> = ({ about, children }) => {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tipId = useId();

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const left = Math.min(Math.max(8, rect.left - 12), window.innerWidth - TIP_WIDTH - 8);
    setPlace({ left, top: rect.bottom + 6 });
  }, [open]);

  useEffect(() => {
    if (!pinned) return;
    const onPointer = (event: PointerEvent) => {
      if (event.target !== buttonRef.current && !buttonRef.current?.contains(event.target as Node)) {
        setPinned(false);
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer, true);
    return () => document.removeEventListener('pointerdown', onPointer, true);
  }, [pinned]);

  const close = () => {
    setPinned(false);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="editor-info"
        aria-label={`Пояснение: ${about}`}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => !pinned && setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned && setOpen(false)}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setPinned((value) => !value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.stopPropagation();
            close();
          }
        }}
      >
        <span aria-hidden="true">i</span>
      </button>
      {open &&
        place &&
        createPortal(
          <div id={tipId} role="tooltip" className="editor-info__tip" style={{ left: place.left, top: place.top, width: TIP_WIDTH }}>
            {children}
          </div>,
          document.body
        )}
    </>
  );
};

/** Подпись поля с необязательным ⓘ. */
export const FieldLabel: React.FC<{ label: string; info?: React.ReactNode; htmlFor?: string }> = ({ label, info, htmlFor }) => (
  <span className="editor-field__label">
    {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
    {info && <InfoTip about={label}>{info}</InfoTip>}
  </span>
);

/**
 * Поле, которое применяется по Enter и при уходе из поля; Escape возвращает
 * прежнее. Отказ показывается красной строкой под полем.
 */
export const CommitField: React.FC<{
  label: string;
  /** Полное название для чтения с экрана, если подпись короткая: «Номер» → «Номер этажа». */
  ariaLabel?: string;
  value: string;
  /** Пояснение за ⓘ: зачем поле, одной фразой. */
  info?: React.ReactNode;
  /** Пример значения внутри пустого поля. */
  placeholder?: string;
  inputMode?: 'text' | 'decimal';
  /** @returns текст проблемы или `null` */
  onCommit: (value: string) => string | null;
}> = ({ label, ariaLabel, value, info, placeholder, inputMode = 'text', onCommit }) => {
  const [text, setText] = useState(value);
  const [problem, setProblem] = useState<string | null>(null);
  const id = useId();

  useEffect(() => {
    setText(value);
    setProblem(null);
  }, [value]);

  const commit = () => {
    if (text === value) {
      setProblem(null);
      return;
    }
    setProblem(onCommit(text));
  };

  return (
    <div className="editor-field">
      <FieldLabel label={label} info={info} htmlFor={id} />
      <input
        id={id}
        aria-label={ariaLabel ?? label}
        aria-invalid={problem !== null}
        aria-describedby={problem !== null ? `${id}-problem` : undefined}
        value={text}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(e) => {
          setText(e.target.value);
          setProblem(null);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            e.stopPropagation();
            setText(value);
            setProblem(null);
          }
        }}
        className="editor-input"
      />
      {problem !== null && (
        <span id={`${id}-problem`} className="editor-field__problem" role="alert">
          {problem}
        </span>
      )}
    </div>
  );
};

/** Флажок с пояснением за ⓘ рядом со строкой — не внутри подписи: щелчок по ⓘ не переключает флажок. */
export const CheckRow: React.FC<{
  label: string;
  info?: React.ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
}> = ({ label, info, checked, onChange }) => (
  <div className="editor-check-row">
    <label className="editor-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="editor-check__text">{label}</span>
    </label>
    {info && <InfoTip about={label}>{info}</InfoTip>}
  </div>
);
