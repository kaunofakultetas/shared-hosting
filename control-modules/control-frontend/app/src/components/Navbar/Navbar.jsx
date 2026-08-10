// -----------------------------------------------------------
//  [*] Navbar — the burgundy top bar
//
//  Shown on every signed-in page: VU logo linking to /, the
//  app-title pill (also a link to /), and on the right a user
//  mini widget (email + role, links to /account), the
//  language switcher and the logout button.
//
//  The switcher shows the language you would SWITCH TO
//  ("Lietuvių" while in English and vice versa).
//
//  Logging out is just a hard navigation to /login — the
//  login page POSTs /api/logout on mount.
//
//  Split into (root component last):
//
//    LanguageSwitcher — the en/lt switch button
//    Navbar           — the bar itself (default export)
//
//  Used by:
//    - AppShell — mounted once above every signed-in page
// -----------------------------------------------------------

import { Link } from "react-router-dom";
import { Button } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';

import { useTranslations, useLocale, useSetLocale } from "@/i18n";







// -----------------------------------------------------------
// LanguageSwitcher
// -----------------------------------------------------------
//
// Button that switches the UI locale via the i18n context's
// setLocale — that writes the choice to the `locale` cookie
// (so later visits keep it) and re-renders the app in the
// new language, no page reload. Styled like the Logout button
// next to it (contained primary with a white border).
//
// Used by:
//   - Navbar (below) — one switcher for the "other" language
// -----------------------------------------------------------

function LanguageSwitcher({ targetLocale, label }) {

  const setLocale = useSetLocale();

  return (
    <Button
      variant="contained"
      onClick={() => setLocale(targetLocale)}
      style={{ marginRight: '15px', border: '1px solid rgba(255, 255, 255, 1)' }}
      sx={{ textTransform: 'none' }}
    >
      {label}
    </Button>
  );
}







// -----------------------------------------------------------
// Navbar (default export)
// -----------------------------------------------------------
//
// Used by:
//   - AppShell — mounted once above every signed-in page
// -----------------------------------------------------------

export default function Navbar({ authdata }) {

  const locale = useLocale();
  const t = useTranslations("navbar");

  return (
    <div className="h-[75px] w-full relative flex items-center text-sm bg-primary border-b-[0.5px] border-b-[rgb(231,228,228)]">

      {/* VU logo */}
      <Link to="/" className="no-underline mx-[30px]">
        <div>
          <img src='/img/vulogo.png' alt="VU logo" />
        </div>
      </Link>

      <div className="w-full p-5 flex items-center justify-between">

        {/* App title pill */}
        <div>
          <Link to="/" className="no-underline">
            <div className="border border-solid border-white rounded-[15px] text-white p-2 px-3">
              {t("title")}
            </div>
          </Link>
        </div>

        <div className="flex items-center">

          {/* User mini widget */}
          <Link to="/account" className="no-underline mr-[30px] relative flex items-center">
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginRight: '20px',
              padding: '8px 16px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
              <PersonIcon style={{ color: 'white', fontSize: '24px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span style={{
                  color: 'white',
                  fontSize: '0.85em',
                  fontWeight: '600',
                  lineHeight: '1.2'
                }}>
                  {authdata?.email || t("user")}
                </span>
                <span style={{
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: '0.7em',
                  lineHeight: '1.2'
                }}>
                  {authdata?.admin === 1 ? t("administrator") : t("user")}
                </span>
              </div>
            </div>
          </Link>

          {/* Language switcher — offers the "other" language */}
          {locale === "en" ?
            <LanguageSwitcher targetLocale="lt" label={t("lithuanian")} />
          :
            <LanguageSwitcher targetLocale="en" label={t("english")} />
          }

          {/* Logout — background comes from the theme's
              contained-primary default (hover turns pink) */}
          <Button
            variant="contained"
            style={{ width: "100%", border: '1px solid rgba(255, 255, 255, 1)' }}
            onClick={() => { window.location.href = "/login" }}
          >
            {t("logout")}
          </Button>

        </div>
      </div>
    </div>
  );
}
