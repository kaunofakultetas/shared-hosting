// -----------------------------------------------------------
//  [*] i18n — lightweight translations (en / lt)
//
//  Hand-rolled replacement for an i18n library. Messages live
//  in src/messages (one JSON tree per locale, merged by
//  messages/index.js into messagesMap). The active locale is
//  remembered in the `locale` cookie; English is the fallback
//  for everything.
//
//  Exports:
//    IntlProvider     — context provider (wraps the app)
//    useLocale        — current locale code ("en" | "lt")
//    useSetLocale     — switch locale (also writes the cookie)
//    useTranslations  — t(key, params) for one namespace
//    useMessages      — raw context (currently unused)
//
//  Typical use:
//    const t = useTranslations("sidebar");
//    t("LISTS.computers")       → "Kompiuteriai"
//    t("greeting", { name })    → fills {name} placeholders
// -----------------------------------------------------------

import { createContext, useContext, useState, useCallback } from 'react';
import { messagesMap } from '@/messages';


const DEFAULT_LOCALE = 'en';
const SUPPORTED_LOCALES = ['en', 'lt'];

const enMessages = messagesMap.en;







// -----------------------------------------------------------
// getLocaleFromCookie
// -----------------------------------------------------------
//
// Initial locale: the `locale` cookie if it holds a supported
// value, otherwise English.
//
// Used by:
//   - IntlProvider (below) — initial state
// -----------------------------------------------------------

function getLocaleFromCookie() {
  const match = document.cookie.match(/(?:^|;\s*)locale=([^;]*)/);
  const locale = match ? match[1] : null;
  return SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
}



const IntlContext = createContext({
  locale: DEFAULT_LOCALE,
  messages: enMessages,
  setLocale: () => {},
});







// -----------------------------------------------------------
// IntlProvider
// -----------------------------------------------------------
//
// Holds the live locale and the matching message tree.
// setLocale validates the value, persists it to the cookie
// and re-renders the app — no page reload.
//
// Used by:
//   - providers.jsx — wraps the app inside the theme
// -----------------------------------------------------------

export function IntlProvider({ children }) {

  const [locale, setLocaleState] = useState(getLocaleFromCookie);
  const messages = messagesMap[locale] || enMessages;

  const setLocale = useCallback((newLocale) => {
    if (SUPPORTED_LOCALES.includes(newLocale)) {
      document.cookie = `locale=${newLocale}; path=/`;
      setLocaleState(newLocale);
    }
  }, []);

  return (
    <IntlContext.Provider value={{ locale, messages, setLocale }}>
      {children}
    </IntlContext.Provider>
  );
}







// -----------------------------------------------------------
// Hooks
// -----------------------------------------------------------

// Current locale code ("en" | "lt")
//
// Used by:
//   - Navbar — locale-aware display
export function useLocale() {
  return useContext(IntlContext).locale;
}


// Raw context: { locale, messages, setLocale }
//
// Used by:
//   - nothing yet — exported for completeness
export function useMessages() {
  return useContext(IntlContext);
}







// -----------------------------------------------------------
// resolve
// -----------------------------------------------------------
//
// Walks a dot-separated path into the message tree:
//   resolve(messages, "sidebar.LISTS") → { TITLE, ... }
// Returns undefined as soon as any step is missing.
//
// Used by:
//   - useTranslations (below) — for the namespace and the key
// -----------------------------------------------------------

function resolve(obj, path) {
  const keys = path.split('.');
  let value = obj;
  for (const k of keys) {
    value = value?.[k];
    if (value === undefined) return undefined;
  }
  return value;
}







// -----------------------------------------------------------
// useTranslations
// -----------------------------------------------------------
//
// Returns t(key, params) scoped to a namespace. Missing
// namespaces/keys fall back to returning the key itself, so
// untranslated strings show up literally instead of crashing.
// {param} placeholders are filled from the params object;
// unknown placeholders are left as-is.
//
// Used by:
//   - Navbar ("navbar"), Sidebar ("sidebar"), and the list
//     pages with their tables and add/edit dialogs
//     (Computers, Rooms, Gates, SaltoUsers, WifiAccessPoints,
//     ActivedirUsers, SystemPage, ...)
// -----------------------------------------------------------

export function useTranslations(namespace) {

  const { messages } = useContext(IntlContext);

  // The returned t() is memoized so components can safely list it
  // in hook dependencies; it only changes on locale switch
  return useCallback((key, params) => {

    // Narrow the message tree to the namespace, e.g. "sidebar"
    // → messages.sidebar. No namespace = whole tree.
    const section = namespace ? resolve(messages, namespace) : messages;
    if (!section) return key;   // unknown namespace → show the key

    // The key itself can be dotted too, e.g. "LISTS.computers"
    const value = resolve(section, key);
    if (value === undefined) return key;            // missing translation → show the key
    if (typeof value !== 'string') return value;    // key points at a subtree, not a leaf

    // Fill {param} placeholders; placeholders with no matching
    // param stay literal so the gap is visible
    if (!params) return value;
    return value.replace(/\{(\w+)\}/g, (_, name) =>
      params[name] !== undefined ? params[name] : `{${name}}`
    );
  }, [messages, namespace]);
}







// -----------------------------------------------------------
// useSetLocale
// -----------------------------------------------------------
//
// Switch the locale.
//
// Used by:
//   - LanguageSwitcher — the navbar language button
// -----------------------------------------------------------

export function useSetLocale() {
  return useContext(IntlContext).setLocale;
}
