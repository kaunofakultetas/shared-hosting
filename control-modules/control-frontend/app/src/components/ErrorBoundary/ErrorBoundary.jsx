// -----------------------------------------------------------
//  [*] ErrorBoundary — the app's last line of defense
//
//  Catches any render/lifecycle crash below it and swaps the
//  dead tree for a small centered card with a reload button —
//  without it, one component throw blanks the whole app
//  permanently, with nothing but the console to say why.
//
//  Mounted OUTSIDE every provider (main.jsx), so the fallback
//  can rely on nothing: no theme, no i18n, no router — plain
//  elements with inline styles and hardcoded English (the
//  same bare-page precedent as /login). The error itself goes
//  to the console for devtools; a boundary cannot catch
//  event-handler or async errors — those already fail without
//  unmounting the tree.
//
//  Used by:
//    - main.jsx — wraps the whole app
// -----------------------------------------------------------

import { Component } from 'react';








// -----------------------------------------------------------
// ErrorBoundary (default export)
// -----------------------------------------------------------
//
// Class component on purpose — error boundaries have no hook
// equivalent. The brand burgundy is hardcoded: the theme
// provider may be the very thing that crashed.
//
// Used by:
//   - main.jsx — wraps the whole app
// -----------------------------------------------------------

export default class ErrorBoundary extends Component {

  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f3f4f6',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          padding: '40px',
          maxWidth: '420px',
          textAlign: 'center',
        }}>
          <h1 style={{ color: '#7B003F', fontSize: '1.3em', marginBottom: '12px' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#4b5563', fontSize: '0.9em', marginBottom: '24px' }}>
            The page hit an unexpected error. Reloading usually
            fixes it — if it keeps happening, contact the
            administrators.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              backgroundColor: '#7B003F',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 24px',
              fontSize: '0.9em',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
