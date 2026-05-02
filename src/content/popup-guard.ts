// ============================================================================
// SenseAI Extension - Popup Guard (MAIN world)
// ============================================================================

const STATE_KEY = '__senseaiPopupGuard';
const TOGGLE_EVENT = 'senseai-popup-guard-toggle';

type PopupGuardState = {
  enabled: boolean;
  originalOpen: typeof window.open;
  originalSetTimeout: typeof window.setTimeout;
  originalSetInterval: typeof window.setInterval;
};

const timerPattern = /window\.open/i;

const getState = (): PopupGuardState => {
  const existing = (window as unknown as Record<string, PopupGuardState | undefined>)[STATE_KEY];
  if (existing?.originalOpen && existing.originalSetTimeout && existing.originalSetInterval) {
    return existing;
  }

  const state: PopupGuardState = {
    enabled: existing?.enabled ?? true,
    originalOpen: existing?.originalOpen || window.open,
    originalSetTimeout: existing?.originalSetTimeout || window.setTimeout,
    originalSetInterval: existing?.originalSetInterval || window.setInterval,
  };

  (window as unknown as Record<string, PopupGuardState>)[STATE_KEY] = state;
  return state;
};

const blockOpen = function () {
  console.info('[SenseAI] Blocked popup');
  return null;
};

const wrapTimer = (original: typeof window.setTimeout) => {
  return function (handler: TimerHandler, ...args: any[]) {
    if (typeof handler === 'string' && timerPattern.test(handler)) {
      console.info('[SenseAI] Blocked popup');
      return 0;
    }
    return original(handler, ...args);
  } as typeof window.setTimeout;
};

const apply = (enabled: boolean) => {
  const state = getState();
  state.enabled = enabled;
  window.open = enabled ? blockOpen : state.originalOpen;
  window.setTimeout = enabled ? wrapTimer(state.originalSetTimeout) : state.originalSetTimeout;
  window.setInterval = enabled ? wrapTimer(state.originalSetInterval) : state.originalSetInterval;
};

const setEnabled = (enabled: boolean) => {
  apply(enabled);
};

const handleToggle = (event: Event) => {
  const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
  const enabled = typeof detail?.enabled === 'boolean' ? detail.enabled : true;
  setEnabled(enabled);
};

window.addEventListener(TOGGLE_EVENT, handleToggle);

const initialState = getState();
apply(initialState.enabled);
