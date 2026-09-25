import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

import { initI18n } from '../i18n';
import { configureDesignSystemText } from '../i18n/configure-design-system';
import en from '../i18n/messages/en.json';

// The app initializes i18n at boot (main.tsx); mirror that for tests so
// translate() returns real English text instead of the bare key — and wire the
// design system's translator the same way, so `<Text text="…" />` resolves.
initI18n('en', en);
configureDesignSystemText();

// jsdom lacks ResizeObserver, which some design-system components observe.
globalThis.ResizeObserver = class {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
} as unknown as typeof ResizeObserver;

// jsdom lacks matchMedia too. The DS Tooltip calls it on mount to detect a
// coarse pointer, so without this ANY component rendering a tooltip throws
// during tests. Reports no match, i.e. a desktop pointer — the hover behaviour
// tests exercise. Override per-test to check the touch path.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}
