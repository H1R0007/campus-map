import type { Messages } from './ru';

/**
 * Строки интерфейса на английском.
 *
 * Форму задаёт русский словарь (`Messages`): пропущенный ключ здесь не
 * скомпилируется. Имена из данных приходят со своими переводами — см. `ru.ts`.
 */
export const en: Messages = {
  app: {
    loading: 'Loading the map…',
    loadFailed: 'Could not load the map',
    retry: 'Try again',
  },

  languageSwitch: 'Interface language',

  map: {
    campus: 'Campus',
    floor: (floor) => `Floor ${floor}`,
    floors: 'Floors',
    floorOnRoute: (floor) => `${floor}, on the route`,
    place: (building, floor) => `${building}, floor ${floor}`,
    backToCampus: 'Back to the campus map',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    fitPlan: 'Show the whole plan',
    planLoading: 'Loading the plan…',
    planUnavailable: 'The plan is unavailable',
    routeStart: 'Route start',
    routeEnd: 'Route end',
  },

  transition: {
    entrance: 'Entrance',
    stairs: 'Stairs',
    lift: 'Lift',
    bridge: 'Passage',
  },

  place: {
    from: 'From here',
    to: 'To here',
    close: 'Close place card',
  },

  search: {
    prompt: 'Where do you want to go?',
    from: 'From',
    to: 'To',
    swap: 'Swap',
    fromPoint: (place) => `From: ${place}`,
    ambiguous: (name) => `“${name}” is in several places — choose one:`,
  },

  link: {
    notFound: (points) => `The point from the link was not found: ${points}`,
    dismiss: 'Dismiss',
  },

  route: {
    title: 'Route',
    view: (scope) => `View: ${scope}`,
    close: 'Close',
    options: 'Route settings',
    build: 'Get route',
    reset: 'Reset',
    ready: 'Route ready',
    showSteps: 'Steps',
    share: 'Share the route',
    linkCopied: 'Link copied',
    resetRoute: 'Clear route',
    stepsTitle: 'Route steps',
    duration: (minutes) => `~${minutes} min`,
    distance: (meters) => `${meters} m`,
    buildingsWord: { one: 'building', other: 'buildings' },
    floorsWord: { one: 'floor', other: 'floors' },
    notFound: (reason) => `No route found: ${reason}`,
    failure: {
      'unknown-start': 'the starting point does not exist',
      'unknown-end': 'the destination does not exist',
      unreachable: 'the points are not connected with the chosen restrictions',
      'iteration-limit': 'the search was interrupted, try other points',
    },
    allowStairs: 'Allow stairs',
    option: {
      noStairs: 'No stairs',
      preferLift: 'Prefer lifts',
    },
  },

  instructions: {
    start: 'Start',
    walkTo: {
      stairs: 'Walk to the stairs',
      lift: 'Walk to the lift',
      bridge: 'Walk to the passage',
      entrance: 'Walk to the entrance',
      exit: 'Walk to the exit',
    },
    walkToDestination: 'Walk to your destination',
    arrive: 'You have arrived',
    exitToCampus: 'Go outside to the campus grounds',
    enterBuilding: 'Enter the building',
    changeBuilding: 'Go to another building',
    move: {
      stairs: { up: 'Take the stairs up', down: 'Take the stairs down', same: 'Take the stairs' },
      lift: { up: 'Take the lift up', down: 'Take the lift down', same: 'Take the lift' },
      bridge: { up: 'Walk through the passage', down: 'Walk through the passage', same: 'Walk through the passage' },
      entrance: { up: 'Go through the entrance', down: 'Go through the entrance', same: 'Go through the entrance' },
    },
  },
};
