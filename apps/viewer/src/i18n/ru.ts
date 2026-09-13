import type { PathFailureReason, TransitionType } from '@campus-map/core';

/**
 * Строки интерфейса на русском — источник формы словаря.
 *
 * Тип `Messages` выводится отсюда, и словарь другого языка обязан повторить
 * каждый ключ: забытая строка не скомпилируется, а не появится по-русски
 * посреди английского интерфейса.
 *
 * Имён из данных (корпусов, помещений) здесь нет: они приходят из датасета со
 * своими переводами и подставляются в именительном падеже. Склонять
 * произвольное имя нельзя ни в одном языке — прежнее «Перейдите из Корпус А в
 * Корпус Б» ломалось именно на этом, — поэтому имя всегда стоит отдельно от
 * глагола: «Войдите в здание — Корпус Б, этаж 1».
 */

/** Направление перехода между этажами. */
type Direction = 'up' | 'down' | 'same';

export const ru = {
  app: {
    loading: 'Загрузка карты…',
    loadFailed: 'Не удалось загрузить карту',
    retry: 'Попробовать снова',
  },

  /** Подпись группы кнопок выбора языка. */
  languageSwitch: 'Язык интерфейса',

  map: {
    campus: 'Кампус',
    floor: (floor: string) => `Этаж ${floor}`,
    floors: 'Этажи',
    /** Подпись кнопки этажа, через который идёт маршрут; `floor` — уже «Этаж 2». */
    floorOnRoute: (floor: string) => `${floor}, по маршруту`,
    place: (building: string, floor: string) => `${building}, этаж ${floor}`,
    backToCampus: 'Вернуться к карте кампуса',
    zoomIn: 'Приблизить',
    zoomOut: 'Отдалить',
    fitPlan: 'Показать план целиком',
    planLoading: 'Загрузка плана…',
    planUnavailable: 'План недоступен',
    routeStart: 'Начало маршрута',
    routeEnd: 'Конец маршрута',
  },

  search: {
    prompt: 'Куда вы хотите попасть?',
    from: 'Откуда',
    to: 'Куда',
    swap: 'Поменять местами',
  },

  route: {
    title: 'Маршрут',
    view: (scope: string) => `Вид: ${scope}`,
    close: 'Закрыть',
    options: 'Настройки маршрута',
    build: 'Построить',
    reset: 'Сброс',
    ready: 'Маршрут готов',
    showSteps: 'Шаги',
    resetRoute: 'Сбросить маршрут',
    stepsTitle: 'Шаги маршрута',
    openCampus: 'Открыть кампус',
    openFloor: (floor: string) => `Открыть этаж ${floor}`,
    /** Время в пути; округление — забота вызывающей стороны. */
    duration: (minutes: number) => `~${minutes} мин`,
    notFound: (reason: string) => `Маршрут не найден: ${reason}`,
    failure: {
      'unknown-start': 'начальная точка не найдена',
      'unknown-end': 'конечная точка не найдена',
      unreachable: 'при выбранных ограничениях точки не связаны',
      'iteration-limit': 'поиск прерван, попробуйте другие точки',
    } satisfies Record<PathFailureReason, string>,
    option: {
      allowStairs: 'Лестницы',
      allowLift: 'Лифты',
      allowBridge: 'Переходы',
      allowEntrance: 'Входы',
      preferLift: 'Предпочитать лифт',
    },
  },

  instructions: {
    start: 'Старт',
    finish: 'Финиш',
    exitToCampus: 'Выйдите на территорию кампуса',
    enterBuilding: 'Войдите в здание',
    changeBuilding: 'Перейдите в другой корпус',
    passEntrance: 'Пройдите через вход',
    move: {
      stairs: { up: 'Поднимитесь по лестнице', down: 'Спуститесь по лестнице', same: 'Пройдите по лестнице' },
      lift: { up: 'Поднимитесь на лифте', down: 'Спуститесь на лифте', same: 'Воспользуйтесь лифтом' },
      bridge: { up: 'Пройдите по переходу', down: 'Пройдите по переходу', same: 'Пройдите по переходу' },
      entrance: { up: 'Пройдите через вход', down: 'Пройдите через вход', same: 'Пройдите через вход' },
    } satisfies Record<TransitionType, Record<Direction, string>>,
  },
};

export type Messages = typeof ru;
