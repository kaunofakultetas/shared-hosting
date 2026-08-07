// -----------------------------------------------------------
//  [*] Messages — per-page translation files (auto-discovered)
//
//  Each page/feature keeps its own en.json + lt.json pair in
//  a folder, grouped by section:
//
//      messages/
//      ├── navbar/{en,lt}.json                → "navbar"
//      ├── sidebar/{en,lt}.json               → "sidebar"
//      ├── PAGES/rooms/{en,lt}.json           → "PAGES.rooms"
//      ├── PAGES/saltoUsers/...               → "PAGES.saltoUsers"
//      └── TABLES/computersTable/...          → "TABLES.computersTable"
//
//  Files are discovered automatically with import.meta.glob —
//  there is NOTHING to register here. The useTranslations()
//  namespace is the folder path verbatim (folder names keep
//  their exact casing, "/" becomes "."):
//
//      messages/PAGES/activedir_users/lt.json
//        → useTranslations("PAGES.activedir_users")
//
//  Adding translations for a new page:
//    1. Create messages/<section>/<page>/en.json and lt.json
//    2. Use useTranslations("<section>.<page>") in the component
//
//  In dev mode, a console warning is printed if the en/lt
//  files of the same folder have mismatched keys.
// -----------------------------------------------------------

const SUPPORTED_LOCALES = ["en", "lt"];


// Eagerly import every locale JSON under messages/
// (keys look like "./PAGES/rooms/en.json")
const modules = import.meta.glob("./**/{en,lt}.json", { eager: true });


// Build one message tree per locale
export const messagesMap = Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, {}]));

for (const [path, module] of Object.entries(modules)) {
  const segments = path.replace("./", "").replace(".json", "").split("/");
  const locale = segments.pop();
  if (!SUPPORTED_LOCALES.includes(locale)) continue;

  // Walk/create the nested namespace objects (folder names used
  // as-is), attach the file content at the leaf
  let node = messagesMap[locale];
  for (const segment of segments.slice(0, -1)) {
    node = node[segment] ??= {};
  }
  node[segments[segments.length - 1]] = module.default ?? module;
}







// -----------------------------------------------------------
// Dev-only consistency check: warn when the en/lt file pair
// of the same folder has mismatched keys (e.g. a key was
// translated in one language but forgotten in the other).
// -----------------------------------------------------------
if (import.meta.env.DEV) {

  const collectLeafPaths = (obj, prefix = "") => {
    const paths = [];
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === "object") paths.push(...collectLeafPaths(value, path));
      else paths.push(path);
    }
    return paths;
  };

  const [base, ...others] = SUPPORTED_LOCALES;
  const baseKeys = new Set(collectLeafPaths(messagesMap[base]));

  for (const locale of others) {
    const localeKeys = new Set(collectLeafPaths(messagesMap[locale]));
    const missing = [...baseKeys].filter((k) => !localeKeys.has(k));
    const extra = [...localeKeys].filter((k) => !baseKeys.has(k));

    if (missing.length > 0)
      console.warn(`[messages] Keys present in "${base}" but missing in "${locale}":`, missing);
    if (extra.length > 0)
      console.warn(`[messages] Keys present in "${locale}" but missing in "${base}":`, extra);
  }
}
