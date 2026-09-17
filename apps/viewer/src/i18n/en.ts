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

  themeButton: (current, next) => `Appearance: ${current.toLowerCase()}. Tap for ${next.toLowerCase()}`,
  theme: {
    system: 'System',
    light: 'Light',
    dark: 'Dark',
  },

  sheet: {
    label: 'Navigator panel',
    expand: 'Expand the panel',
    collapse: 'Collapse the panel',
  },

  map: {
    campus: 'Campus',
    buildings: 'Buildings',
    floor: (floor) => `Floor ${floor}`,
    floors: 'Floors',
    floorOnRoute: (floor) => `${floor}, on the route`,
    floorRouteStart: (floor) => `${floor}, route start`,
    floorRouteEnd: (floor) => `${floor}, route end`,
    floorCurrentStep: (floor) => `${floor}, current step`,
    place: (building, floor) => `${building}, floor ${floor}`,
    backToCampus: 'Back to the campus map',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    fitPlan: 'Show the whole plan',
    north: 'Rotate the map to north',
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

  quick: {
    label: 'Nearby',
    category: {
      toilet: 'Toilet',
      food: 'Canteen',
      cloakroom: 'Cloakroom',
      exit: 'Exit',
    },
    nearest: {
      toilet: 'Nearest toilet',
      food: 'Nearest canteen',
      cloakroom: 'Nearest cloakroom',
      exit: 'Nearest exit',
    },
    sameFloor: 'this floor',
    none: 'not found',
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
    nearestStart: {
      title: 'Where are you now?',
      placeholder: 'A room or place near you',
      hint: 'Choose a place near you and the route will lead to the nearest one.',
    },
    hint: 'A room number, a name or what you need: “305”, “library”, “toilet”',
    categoryTerms: {
      toilet: ['toilet', 'restroom', 'bathroom', 'lavatory', 'wc'],
      food: ['canteen', 'cafeteria', 'cafe', 'food', 'eat', 'lunch', 'coffee'],
      cloakroom: ['cloakroom', 'coat check', 'wardrobe'],
      exit: ['exit', 'way out', 'entrance'],
    },
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
    duration: (minutes) => `~${minutes}\u00a0min`,
    distance: (meters) => `${meters}\u00a0m`,
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
    progress: 'Route progress',
    remaining: (duration) => `${duration} left`,
  },

  arrival: {
    title: 'You have arrived',
    back: 'Back',
    toExit: 'To the exit',
  },

  onboarding: {
    label: 'Getting started',
    skip: 'Skip',
    next: 'Next',
    done: 'Start using',
    progress: (step, total) => `${step} of ${total}`,
    slides: {
      search: {
        title: 'Find the place you need',
        text: 'Type a room number or a name, like “305” or “library”. The Toilet and Canteen buttons there lead to the nearest ones.',
      },
      qr: {
        title: 'The QR code at the door means “you are here”',
        text: 'Scan the code on the sign at an entrance or staircase and the route will start where you stand.',
      },
      steps: {
        title: 'Follow the steps',
        text: 'Tap Start: the navigator shows each step, opens the right floor by itself and keeps the screen on.',
      },
    },
  },

  offline: {
    notice: 'No connection — the navigator works offline',
    planUnavailable: 'This floor plan is not saved — connect to load it',
  },

  update: {
    ready: 'The map has been updated',
    apply: 'Reload',
    later: 'Later',
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
