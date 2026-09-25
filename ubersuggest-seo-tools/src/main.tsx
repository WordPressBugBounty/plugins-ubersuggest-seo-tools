// Single CSS entry: styles.css imports the DS stylesheet itself, so the DS theme
// tokens and our utilities compile in ONE Tailwind run (see the note in there).
import './styles.css';
import { DesignSystemProvider } from '@ui';
import { createRoot } from 'react-dom/client';

import App from './App';
import { currentLang, initI18n } from './i18n';
import { configureDesignSystemText } from './i18n/configure-design-system';
import en from './i18n/messages/en.json';

// Load the active locale's messages BEFORE rendering: English is bundled as the
// fallback base, and any other locale is fetched on demand (Vite code-splits one
// chunk per JSON) so only the active language ships — not all nine. translate()
// stays synchronous everywhere once this has run.
async function bootstrap() {
  const lang = currentLang();
  const messages =
    lang === 'en'
      ? en
      : { ...en, ...(await import(`./i18n/messages/${lang}.json`)).default };
  initI18n(lang, messages);
  configureDesignSystemText();

  const root = document.getElementById('root');
  if (root) {
    createRoot(root).render(
      <DesignSystemProvider initialLanguage={lang} autoDetect={false}>
        <App />
      </DesignSystemProvider>,
    );
  }
}

void bootstrap();

// Fixed-height iframe for now. If a screen ever needs to grow past the viewport,
// add postMessage auto-height (ResizeObserver here → parent sets iframe height).
