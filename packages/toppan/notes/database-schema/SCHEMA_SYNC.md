# Database Schema Synchronization

## Architecture

The Toppan service is **self-initializing** and works in both development (Docker) and production environments.

### Schema Files

| File | Purpose | When Created |
|------|---------|--------------|
| **`init/database.sql`** | **Single source of truth** | Always exists (committed) |
| **`src/init-schema.sql`** | **Runtime copy (generated)** | Created by Dockerfile at build time |

### How It Works

**Smart path resolution** - code automatically detects the environment:

```typescript
// Auto-detects dev vs production
const isProduction = __dirname.includes('build/dist')
const schemaPath = isProduction
  ? 'init-schema.sql'             // Production: Docker-bundled copy
  : '../../../init/database.sql'  // Dev: Source directly
```

**Development (local run):**
- `yarn start` → Runs from `src/` → Uses `../../../init/database.sql`
- No need to copy anything manually!

**Production (Docker):**
- Dockerfile copies `init/database.sql` → `src/init-schema.sql` at build time
- `yarn start:prod` → Runs from `build/dist/` → Uses `init-schema.sql`

## Initialization Flow

```typescript
// simple-migrations.ts on Toppan startup:

1. Check if 'person' table exists
   ├─ No → Load src/init-schema.sql (creates full schema)
   └─ Yes → Skip (schema already exists)

2. Run Toppan-specific migrations (if any)
   └─ Currently none (empty migrations array)
```

### Environment Behaviors

**Development (Docker Compose)**:
```
1. PostgreSQL container mounts init/database.sql → /docker-entrypoint-initdb.d/
   └─ Creates schema on first container start (PostgreSQL entrypoint)
2. Toppan service starts → Detects schema exists → Skips init
```

**Production (Docker)**:
```
1. PostgreSQL (AWS RDS) is empty
2. Toppan service starts → Detects no schema → Loads init-schema.sql
```

## Schema Update Process

When you update the database schema:

### Step 1: Update Master Schema
```bash
# Edit the ONLY file you need to touch
vim /opencrvs-core/init/database.sql
```

### Step 2: Rebuild Docker
```bash
# Rebuild Toppan Docker image
# Dockerfile automatically copies init/database.sql → src/init-schema.sql
docker build -t toppan:latest packages/toppan/
```

**That's it!** No manual copying needed. The Dockerfile handles it.

## Toppan-Specific Migrations

For changes that are **only for Toppan** (not core OpenCRVS):

1. Create migration file: `packages/toppan/src/migrations/XXX-description.sql`
2. Add to migrations array in `simple-migrations.ts`:
   ```typescript
   const migrations = ['XXX-description.sql']
   ```
3. Migration runs on next Toppan startup (only once per migration)

## Migration Files Explained

### `simple-migrations.ts` (Used in Production)
- **Runs on Toppan service startup** (every time)
- Checks if schema exists → Creates if missing
- Runs Toppan-specific migrations
- **This is what production uses**

### `run-migrations.ts` (Manual Tool)
- **Manual developer tool** (not used in production)
- For local database reset/init
- Same logic as `simple-migrations.ts` but can be run standalone
- Usage: `ts-node packages/toppan/src/run-migrations.ts`

**In summary:**
- **Production**: Uses `simple-migrations.ts` (automatic on startup)
- **Development**: Can use either (both do the same thing)

## Important Notes

✅ **Single Source of Truth**: `init/database.sql` is the only file you edit
✅ **Auto-Generated**: `init-schema.sql` is created by Dockerfile (don't commit it!)
✅ **No Manual Sync**: Dockerfile handles copying automatically
✅ **No Duplicates**: Don't put schema DDL in Toppan migrations if it's already in init/database.sql
