import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CURATED_ICON_GROUPS,
  LIBRARY_SECTIONS,
  iconImageOf,
  iconLabel,
  loadIconLibrary,
  searchIcons,
} from '../../utils/iconLibrary';
import type { IconLibrary } from '../../utils/iconLibrary';
import { customIconFromFile } from '../../utils/customIcon';
import { Icon } from './Icon';

/** Что выбрано: имя значка (`tabler:<имя>` или `custom`) и его картинка. */
export interface IconChoice {
  icon: string;
  iconImage: string;
}

interface IconPickerProps {
  /** Значок вида сейчас — выбранный в сетке отмечен. */
  current: { icon?: string };
  onPick: (choice: IconChoice) => void;
  onClose: () => void;
}

/** Картинки значков библиотеки: считаются один раз на значок. */
const imageCache = new Map<string, string>();

function cachedImage(library: IconLibrary, name: string): string | null {
  const cached = imageCache.get(name);
  if (cached) return cached;
  const image = iconImageOf(library, name);
  if (image) imageCache.set(name, image);
  return image;
}

/**
 * Выбор значка вида — отдельное окошко поверх окна «Все виды».
 *
 * Значков больше пяти тысяч, и в окно вида они не помещаются: здесь — подборка
 * «для кампуса» с русскими названиями, поиск по-русски и по-английски, вся
 * библиотека по разделам и загрузка своего значка. Библиотека загружается при
 * первом открытии: остальному редактору она не нужна.
 */
export const IconPicker: React.FC<IconPickerProps> = ({ current, onPick, onClose }) => {
  const [library, setLibrary] = useState<IconLibrary | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [openSections, setOpenSections] = useState<ReadonlySet<string>>(new Set());
  const [uploadError, setUploadError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    loadIconLibrary()
      .then((loaded) => alive && setLibrary(loaded))
      .catch(() => alive && setFailed(true));
    searchRef.current?.focus();
    return () => {
      alive = false;
    };
  }, []);

  const selected = current.icon?.startsWith('tabler:') ? current.icon.slice('tabler:'.length) : null;

  const results = useMemo(() => (library && query.trim() ? searchIcons(library, query) : []), [library, query]);

  /** Значки раздела библиотеки — по категории набора. */
  const sections = useMemo(() => {
    const byCategory = new Map<string, string[]>();
    for (const icon of library?.values() ?? []) {
      const list = byCategory.get(icon.category);
      if (list) list.push(icon.name);
      else byCategory.set(icon.category, [icon.name]);
    }
    return byCategory;
  }, [library]);

  const pick = (name: string) => {
    const image = library ? cachedImage(library, name) : null;
    if (image) onPick({ icon: `tabler:${name}`, iconImage: image });
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    try {
      onPick({ icon: 'custom', iconImage: await customIconFromFile(file) });
    } catch (cause) {
      setUploadError(cause instanceof Error ? cause.message : 'Значок не загрузился');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const grid = (names: readonly string[]) =>
    library && (
      <div className="editor-icon-grid" role="group">
        {names.map((name) => {
          const image = cachedImage(library, name);
          if (!image) return null;
          return (
            <button
              key={name}
              type="button"
              className="editor-icon-choice"
              aria-pressed={selected === name}
              aria-label={iconLabel(name)}
              title={iconLabel(name)}
              onClick={() => pick(name)}
            >
              <span
                aria-hidden="true"
                className="editor-kind-icon"
                style={{ width: 20, height: 20, WebkitMaskImage: `url("${image}")`, maskImage: `url("${image}")` }}
              />
            </button>
          );
        })}
      </div>
    );

  return (
    <div
      className="editor-icon-picker"
      role="dialog"
      aria-modal="true"
      aria-label="Выбор значка"
      onKeyDown={(e) => {
        // Esc закрывает только выбор значка, а не окно видов под ним.
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="editor-icon-picker__header">
        <h3 className="editor-card__heading">Значок вида</h3>
        <button type="button" className="editor-icon-button" onClick={onClose} aria-label="Закрыть выбор значка">
          <Icon name="close" />
        </button>
      </div>

      <input
        ref={searchRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Найти значок"
        placeholder="Например: кофе, врач, printer"
        className="editor-input"
      />

      <div className="editor-icon-picker__body">
        {failed ? (
          <p className="editor-section__hint editor-section__hint--problem">
            Библиотека значков не загрузилась. Можно загрузить свой значок кнопкой ниже.
          </p>
        ) : !library ? (
          <p className="editor-section__hint">Загружаю значки…</p>
        ) : query.trim() ? (
          results.length > 0 ? (
            <section aria-label="Найденные значки">
              <p className="editor-section__hint">Найдено: {results.length}</p>
              {grid(results)}
            </section>
          ) : (
            <p className="editor-section__hint">Ничего не нашлось. Попробуйте другое слово — по-русски или по-английски.</p>
          )
        ) : (
          <>
            {CURATED_ICON_GROUPS.map((group) => (
              <section key={group.title} className="editor-icon-picker__group" aria-label={group.title}>
                <h4 className="editor-icon-picker__title">{group.title}</h4>
                {grid(group.icons.map((icon) => icon.name))}
              </section>
            ))}

            <h4 className="editor-icon-picker__title">Вся библиотека</h4>
            {LIBRARY_SECTIONS.filter(([category]) => sections.has(category)).map(([category, title]) => (
              <details
                key={category}
                className="editor-card__details"
                onToggle={(e) => {
                  const isOpen = e.currentTarget.open;
                  setOpenSections((previous) => {
                    const next = new Set(previous);
                    if (isOpen) next.add(category);
                    else next.delete(category);
                    return next;
                  });
                }}
              >
                <summary>
                  <Icon name="chevronRight" className="editor-card__chevron" />
                  {title} ({sections.get(category)?.length ?? 0})
                </summary>
                {/* Раздел рисуется, только когда открыт: всех значков разом браузер не ждёт. */}
                {openSections.has(category) && grid(sections.get(category) ?? [])}
              </details>
            ))}
          </>
        )}
      </div>

      <div className="editor-icon-picker__footer">
        <button type="button" className="editor-button" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" />
          Загрузить свой значок…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp"
          aria-label="Файл своего значка"
          hidden
          onChange={(e) => void upload(e.target.files?.[0])}
        />
        <p
          className={uploadError ? 'editor-section__hint editor-section__hint--problem' : 'editor-section__hint'}
          role={uploadError ? 'alert' : undefined}
        >
          {uploadError ?? 'SVG или картинка. Лучше одноцветный значок на прозрачном фоне: навигатор перекрасит его под тему.'}
        </p>
      </div>
    </div>
  );
};
