import { createContext, useContext } from 'react';

/**
 * Правка из карточки точки: всё, что человек меняет в карточке, — одна запись
 * истории. Передумал несколько раз — отмена возвращает всё разом; в итоге
 * ничего не изменилось — записи нет вовсе.
 */
export const CardEdit = createContext<(fn: () => void) => void>((fn) => fn());
export const useCardEdit = () => useContext(CardEdit);
