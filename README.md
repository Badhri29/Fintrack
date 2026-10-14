# Fintrack

Fin Track Intelligence: track net worth, transactions, and budgets in real time.

## Stack

- **Frontend:** React + Vite (`frontend/`)
- **Backend:** Spring Boot 3 + JPA (`backend/`)
- **Database:** MySQL 8 — schema defined in **`prisma/schema.prisma`** (same workflow as Prisma-based projects)

## Database setup (no manual table creation)

1. Create an empty MySQL database (e.g. `networth_db`) and a user with access.
2. Copy environment file and set your connection string:

   ```bash
   cp .env.example .env
   ```

   Edit `DATABASE_URL` in `.env` to match your MySQL user, password, host, and database name.

3. Install Prisma CLI dependencies (repo root):

   ```bash
   npm install
   ```

4. Create all tables from the schema:

   ```bash
   npm run db:migrate
   ```

   On first run, Prisma will prompt for a migration name (e.g. `init`). This applies SQL under `prisma/migrations/` to MySQL.

**Other commands**

| Command | Purpose |
|--------|---------|
| `npm run db:push` | Sync schema to DB without a migration file (prototyping) |
| `npm run db:deploy` | Apply pending migrations (production/CI) |
| `npm run db:studio` | Browse/edit data in Prisma Studio |

After the database exists, start the backend with `DB_USER`, `DB_PASSWORD`, and `DB_*` aligned with `.env`, then run the frontend as usual.

**Already have tables in MySQL?** Either drop and recreate with `npm run db:migrate`, or run `npx prisma db pull` to sync `schema.prisma` from the live DB, then `npx prisma migrate resolve --applied 20261014120000_init` to mark the initial migration as applied without re-running it.

## Changing the schema

1. Edit `prisma/schema.prisma`.
2. Run `npm run db:migrate` and give the migration a name.
3. Update the matching JPA entity under `backend/src/main/java/com/networth/entity/` so Spring Boot stays in sync.
