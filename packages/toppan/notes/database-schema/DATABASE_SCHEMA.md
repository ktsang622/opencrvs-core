# Database Schema

The Toppan service uses the consolidated database schema:

- **Master**: `/opencrvs-core/init/database.sql` (single source of truth)
- **Toppan Copy**: `packages/toppan/src/init-schema.sql` (for Docker packaging)

See [SCHEMA_SYNC.md](SCHEMA_SYNC.md) for synchronization details.

The schema contains:
- Table definitions (person, event, event_participant, family_links_forward, etc.)
- All database functions (upsert_family_link_forward_shadow, apply_event_participant_change_shadow)
- All database triggers (birth/marriage/death relationship handling)
- All views (family_links_bidirectional, get_family)

## Database Initialization Flow

The Toppan service is **self-initializing** and works in both Docker and production environments.

### Automatic Initialization (All Environments)

When the Toppan service starts ([simple-migrations.ts](src/simple-migrations.ts)):

1. **Check if schema exists** (looks for `person` table)
2. **If not exists**: Load and execute `init/database.sql` (full schema)
3. **If exists**: Skip schema creation
4. **Apply Toppan-specific migrations** (e.g., unique father constraint)

```typescript
// Toppan index.ts startup
await runSimpleMigrations()
  ├─ Check schema exists? No → Load init/database.sql
  ├─ Check schema exists? Yes → Skip
  └─ Run Toppan migrations (001-unique-active-father-per-event.sql)
```

### Docker Optimization (Optional)

Docker environments can **optionally** pre-initialize via PostgreSQL entrypoint:

```yaml
# docker-compose.*.yml (optional optimization)
postgres:
  volumes:
    - ./init/database.sql:/docker-entrypoint-initdb.d/01-database.sql  ← Runs on first container start
```

This is purely an **optimization** - if PostgreSQL already created the schema, Toppan service will detect it and skip re-creation.

### Why Both Approaches?

- **Docker entrypoint**: Fast initialization when container first starts (PostgreSQL does it)
- **Toppan service**: Ensures schema exists in **any** environment (Docker, AWS RDS, local dev)
- **Result**: Works everywhere, no manual setup required

### Manual Migration (Development)

For manual database setup or reset, use `run-migrations.ts`:

```bash
# Force full schema re-initialization + Toppan migrations
ts-node packages/toppan/src/run-migrations.ts
```

## Key Features

### Family Relationship Handling

The schema uses a modern trigger-based approach:

1. **Canonical Storage**: `family_links_forward` table stores all relationships
2. **Bidirectional View**: `family_links_bidirectional` automatically generates reverse relationships
3. **Automatic Creation**: Triggers on `event_participant` inserts create family relationships:
   - Birth: Child → Mother/Father links
   - Marriage: Spouse ↔ Spouse links (legal marriage, solid line)
   - Death (subject): Closes spouse/partner links
   - Death (spouse): Creates informational spouse link (dotted line, auto-closed)

### Death Spouse Handling

When a death registration includes spouse information:
- Creates `family_links_forward` entry with `source='death_registration'`
- Immediately closes the link (`end_date = death_date`)
- Marks as informational: "not legal marriage"
- Family tree displays as **dotted line** (vs solid line for marriage events)

## Legacy Tables

⚠️ **Deprecated**: The `family_link` table is kept for backward compatibility but should not be used for new code. All new development should use `family_links_forward` and `family_links_bidirectional`.
