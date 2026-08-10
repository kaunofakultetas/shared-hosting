# control-frontend — the App Hosting Platform SPA

The Vite + React 19 single-page app of the control panel: MUI 7 (DataGrid 8),
Tailwind v4, TanStack Query for every backend fetch (polling + invalidation),
hand-rolled en/lt i18n, and a persistent app shell (Navbar/Sidebar/Footer
mounted once). Served behind the control Caddy — the SPA and the API share
one origin, `/api/*` goes to `hosting-control-backend`.

```
control-frontend/
├── Dockerfile          # prod: node build → Caddy serving /app/dist
├── Dockerfile.dev      # dev: Vite dev server on 0.0.0.0:80
├── Caddyfile           # the prod static-serving config (SPA fallback)
├── pushDockerhub.sh
└── app/
    ├── vite.config.js  # @ → src alias, dev server host config
    └── src/
        ├── main.jsx            # StrictMode + ErrorBoundary + QueryClient
        ├── App.jsx             # providers (theme, i18n, auth) — /login stays bare
        ├── AppShell.jsx        # the persistent frame + auth skeleton
        ├── router.jsx          # the route table
        ├── i18n.jsx            # cookie-persisted en/lt, <html lang> sync
        ├── theme.js            # brand burgundy + Tailwind bridge
        ├── components/         # flat, one folder per component
        ├── messages/           # en/lt catalogs (machine-checked parity)
        └── systemPages/        # Login, user pages, admin pages
```

## Running

Compose service `hosting-control-frontend`. Dev mode (current default) uses
`Dockerfile.dev` + the source bind mount — Vite hot-reloads on save. The
prod flip is the `# Dev`/`# Prod` comment toggle in docker-compose.yml
(static build served by Caddy).

All commands run inside the container — the host has no node:

```bash
sudo docker exec -w /app hosting-control-frontend npm run lint
sudo docker exec -w /app hosting-control-frontend npm run build
```

Lint gate: 0 errors (7 known warnings are accepted).

## Conventions

- House comment style: banner rulers, 7-blank section rhythm, real
  "Used by" lists, root component last (see `.claude/skills/house-comments`).
- Components live flat under `src/components/`, one folder deep.
- Single-consumer hooks live inside their consumer's file.
- List/tab state lives in the URL (`/vm?q=…&all=1`, `?tab=domains`); the VM
  list also restores its scroll position on Back.
- The login page renders bare (no providers) with hardcoded English and
  maps the backend's machine error codes to its own wording.
