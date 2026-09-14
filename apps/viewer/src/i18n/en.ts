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
    crashed: 'Something went wrong',
    crashedHint: 'Reload the page: your route is kept in the address.',
    reload: 'Reload',
  },

  languageSwitch: 'Interface language',

  sheet: {
    label: 'Navigator panel',
    expand: 'Expand the panel',
    collapse: 'Collapse the panel',
  },

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
    route: 'Directions',
    from: 'From here',
    close: 'Close place card',
  },

  search: {
    open: {
      place: 'Find a room or place',
      from: 'Where does the route start?',
      to: 'Where do you want to go?',
    },
    placeholder: {
      place: 'Room, office or place',
      from: 'Where does the route start',
      to: 'Where are you going',
    },
    title: {
      place: 'Find a place',
      from: 'Route start',
      to: 'Destination',
    },
    hint: 'A room number or a name: “305”, “library”',
    nothingFound: (query) => `Nothing found for “${query}”`,
    close: 'Close search',
    clear: 'Clear search',
    buildings: 'Buildings',
    recent: 'Recent',
    clearRecent: 'Clear',
    clearRecentLabel: 'Clear recent places',
    from: 'From',
    to: 'To',
    swap: 'Swap',
    suggestions: 'Suggestions',
    clearPoint: (place) => `Remove point: ${place}`,
  },

  link: {
    notFound: (points) => `The point from the link was not found: ${points}`,
    dismiss: 'Dismiss',
  },

  route: {
    title: 'Route',
    summaryLine: (summary) => `Route · ${summary}`,
    fromPlace: (place) => `From: ${place}`,
    notFoundTitle: 'No route found',
    edit: 'Edit',
    start: 'Start',
    options: 'Restrictions',
    announceReady: (summary) => `Route ready: ${summary}`,
    showSteps: 'Steps',
    share: 'Share the route',
    linkCopied: 'Link copied',
    copyLinkTitle: 'Copy the link',
    copyLinkHint: 'The link could not be copied automatically — select it and copy it.',
    linkLabel: 'Route link',
    done: 'Done',
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

  navigation: {
    stepOf: (step, total) => `Step ${step} of ${total}`,
    previous: 'Previous step',
    next: 'Next',
    finish: 'Done',
    exit: 'End step-by-step navigation',
    showOnMap: 'Show the step on the map',
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
