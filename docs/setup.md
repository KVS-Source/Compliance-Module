# Local setup

1. Install Node.js 18+ and PostgreSQL 14+.
2. Run `npm install` and copy `.env.example` to `.env`.
3. Create the `genbioca_grc` database and update `DATABASE_URL` if necessary.
4. Run `npm run prisma:migrate` and `npm run prisma:seed`.
5. Start with `npm run dev`.
6. Open `/api-docs`, log in, and send the returned token as `Authorization: Bearer <token>`.

For an existing migration history use `npm run prisma:deploy`. Set `DATABASE_URL_TEST` to a separate migrated PostgreSQL database to enable integration tests. Never point tests at production.
