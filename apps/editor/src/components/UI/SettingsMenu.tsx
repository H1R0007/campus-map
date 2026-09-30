import React, { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import type { ThemeChoice } from '../../utils/layoutPrefs';
import { Icon } from './Icon';

const THEMES: { id: ThemeChoice; label: string }[] = [
  { id: 'system', label: 'Как в системе' },
  { id: 'dark', label: 'Тёмная' },
  { id: 'light', label: 'Светлая' },
];

/**
 * Настройки редактора: пока — тема (запись 56).
 *
 * Шестерёнка в шапке, рядом со справкой: найти легко, внимания не требует.
 * Меню закрывается щелчком мимо и Escape.
 */
export const SettingsMenu: React.FC = () => {
  const themeChoice = useEditorStore((s) => s.themeChoice);
  const setThemeChoice = useEditorStore((s) => s.setThemeChoice);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div className="editor-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="editor-icon-button"
        aria-label="Настройки"
        title="Настройки"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="settings" size={18} />
      </button>
      {open && (
        <div className="editor-menu__popover" role="group" aria-label="Настройки">
          <div className="editor-menu__title">Тема</div>
          <div role="radiogroup" aria-label="Тема" className="editor-menu__options">
            {THEMES.map((theme) => (
              <label key={theme.id} className="editor-menu__option">
                <input
                  type="radio"
                  name="editor-theme"
                  checked={themeChoice === theme.id}
                  onChange={() => setThemeChoice(theme.id)}
                />
                {theme.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
