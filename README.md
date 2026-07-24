# GenBioCa Compliance Platform — PERN React Milestone 1

Milestone 1 is a PERN application: PostgreSQL, Express, React/TypeScript and Node.js. The approved single-file prototype is preserved under `docs/prototype/` as a visual and workflow reference; it is no longer the production frontend architecture. React now provides the application shell, routing, authentication, Company switching, dashboard and the required read-only master screens.

## Docker setup

```bash
docker compose up --build
```

Open:

- App: http://localhost:8000/
- Health: http://localhost:8000/api/v1/health
- Swagger: http://localhost:8000/api/docs

The app container waits for PostgreSQL health, applies committed migrations, runs the idempotent seed and starts.

## Local setup

Requirements: Node 20+ and PostgreSQL 16+.

```bash
cp .env.example backend/.env
cd frontend
npm install
npm run dev
```

In a second terminal:

```bash
cd backend
npm install
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Exact verification commands:

```bash
cd frontend
npm run lint
npm run typecheck
npm run build
npm run test:e2e
cd ../backend
npm run format:check
npm run lint
npm run typecheck
npm run prisma:validate
npm run build
npm run test:unit
npm run test:integration
cd ..
docker compose config
```

The Vite development app is served at `http://localhost:5173` and proxies
`/api` to the Express API on `http://localhost:8000`. Docker builds the React
application and serves its production bundle from Express at port 8000.

## React Milestone 1 scope

- React Router preserves every approved route and translates legacy hash URLs.
- API-connected routes: login, dashboard master summaries, Company Setup, User
  Management, Departments, Locations, Organisation Units, Framework Master and
  Framework Rules.
- Later routes remain navigable as explicitly pending screens; their workflows
  and authoritative APIs are not implemented early.
- Browser storage contains sidebar/open-section UI preferences only.
- Access tokens remain in memory; rotating refresh tokens use an HTTP-only,
  same-origin cookie.

See `docs/frontend-route-mapping.md` for the complete route/component/API/status
inventory.

## Development credentials

- Company Admin: `admin001@example.test` / `Admin001!Secure`
- Company user: `user001@example.test` / `User001!Secure`

These are local development credentials only.

## Documentation

The access token remains in memory. The rotating refresh token is a same-origin HTTP-only cookie. In API mode, browser storage contains only UI preferences.

See `docs/frontend-inventory.md`, `docs/frontend-route-mapping.md`, `docs/schema-alignment.md`, `docs/api-mapping.md` and `docs/architecture-decisions.md`.
