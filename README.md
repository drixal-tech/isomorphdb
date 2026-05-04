# IsomorphDB

[![npm version](https://img.shields.io/npm/v/isomorphdb.svg)](https://www.npmjs.com/package/isomorphdb)
[![License: AGPL 3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)
[![CI](https://github.com/dhananjay/isomorphdb/actions/workflows/ci.yml/badge.svg)](https://github.com/dhananjay/isomorphdb/actions/workflows/ci.yml)

**IsomorphDB generates synthetic Postgres databases locally. Zero data egress. Relationally consistent. In two commands.**

---

## The Problem

You're copying production data to your laptop. You know it's wrong, but you do it anyway because:

- **Faker.js** requires hand-wiring every fixture. You spend more time writing seed scripts than shipping features.
- **Tonic/Gretel** cost $20–30k/year and require sending your data to their cloud.
- **pg_dump + anonymize** is a pipe dream — you've never finished building the pipeline.

IsomorphDB fixes this. It reads **only metadata** from your database (table structures, column types, aggregate statistics — **never individual rows**). All synthetic data generation happens **on your machine**. No data ever leaves your infrastructure.

## How It Works

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   1. PROFILE │ ──▶ │   2. MORPH   │ ──▶ │    3. USE    │
│              │     │              │     │              │
│  Read schema │     │  Generate    │     │  Load into   │
│  metadata    │     │  synthetic   │     │  local DB    │
│  (no rows!)  │     │  data        │     │  or use SQL  │
└──────────────┘     └──────────────┘     └──────────────┘
```

## Quick Start

## Installation

### Globally via npm

```bash
npm install -g isomorphdb
```

### Usage as an MCP Server

IsomorphDB provides a native Model Context Protocol (MCP) server, exposing 5 powerful tools. These tools allow AI assistants to seamlessly profile schemas, generate synthetic test data, and directly query that data—without ever touching production credentials.

#### Exposed MCP Tools
1. **`isomorphdb_profile`**: Profiles a production Postgres database to capture schema metadata safely.
2. **`isomorphdb_morph`**: Generates synthetic relational data from the profile and populates your managed mirror database automatically.
3. **`isomorphdb_status`**: Reads the latest profile metadata to summarize tables and dependencies.
4. **`isomorphdb_connect`**: Provides a secure, read-only connection string and table stats for the synthetic managed mirror database.
5. **`isomorphdb_query`**: Securely executes read-only `SELECT` queries against the synthetic managed mirror. Rejects any modifying queries (INSERT/UPDATE/DELETE) and strictly limits results to 1000 rows.

> **Note:** The managed mirror database connection string is stored in `~/.isomorphdb/config.json` under the `isomorph_db` key. It defaults to `postgres://localhost:5432/isomorphdb_morph`.
> **Security Warning:** Your connection string is stored locally in `~/.isomorphdb/config.json` — treat this file like a `.env` file and do not commit it to version control.

#### Security Best Practice: Read-Only Mirror User

For defense-in-depth, create a dedicated read-only Postgres user for your mirror database. The MCP query tool already enforces SELECT-only via SQL AST validation, but a read-only user provides an additional database-level safeguard:

```sql
-- Run these on your mirror database
CREATE USER isomorphdb_reader WITH PASSWORD 'your_secure_password';
GRANT CONNECT ON DATABASE isomorphdb_morph TO isomorphdb_reader;
GRANT USAGE ON SCHEMA public TO isomorphdb_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO isomorphdb_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO isomorphdb_reader;
```

Then set your `isomorph_db` config to use this user:
```
postgres://isomorphdb_reader:your_secure_password@localhost:5432/isomorphdb_morph
```

#### Claude Code
To add IsomorphDB to Claude Code:
```bash
claude mcp add isomorphdb-mcp -- npx isomorphdb-mcp
```

#### Cursor
1. Open Cursor Settings → Features → MCP.
2. Click **+ Add new MCP server**.
3. Set the name to `IsomorphDB` and the command to `npx isomorphdb-mcp`.
4. Click Save.

---

## Quickstart

```bash
# Profile your database (reads ONLY metadata — zero rows)
isomorphdb profile --db $DATABASE_URL

# Generate 10,000 synthetic rows
isomorphdb morph --rows 10000
```

That's it. Your synthetic database is in `./isomorphdb-output/`.

## What Data Does IsomorphDB Read?

### ✅ What the profiler reads (metadata only)

- Table names, column names, column types
- Primary key, foreign key, and unique constraints
- ENUM type definitions
- Aggregate statistics: `COUNT(*)`, `MIN()`, `MAX()`, `AVG()`, `COUNT(DISTINCT)`, `STDDEV()`
- Top-20 value frequency distributions (for realistic generation)

### ❌ What the profiler NEVER reads

- Individual row values (`SELECT *` is never executed)
- Passwords, tokens, API keys, PII
- File contents, BLOBs, or binary data
- Your connection string is never written to disk or logged

## CLI Reference

### `isomorphdb profile`

Profile a Postgres database schema.

```
Usage: isomorphdb profile [options]

Options:
  -d, --db <connection-string>   Postgres connection string (required)
                                  Can also be set via ISOMORPHDB_DB env var
  -o, --output <path>             Output path for schema.isomorph.json
                                  (default: ./schema.isomorph.json)
  -s, --schema <schema>           Postgres schema name (default: public)
  --no-stats                      Skip statistical profiling (schema only)
  -v, --verbose                   Show detailed progress
  -h, --help                      Show help
```

### `isomorphdb morph`

Generate synthetic data from a profile.

```
Usage: isomorphdb morph [options]

Options:
  -p, --profile <path>            Path to schema.isomorph.json
                                  (default: ./schema.isomorph.json)
  -r, --rows <number>             Total synthetic rows to generate
                                  (default: 10000)
  -o, --out <target>              Output target:
                                    ./sql — write SQL files (default)
                                    postgres://... — write to local Postgres
  --no-validate                   Skip post-generation validation
  --seed <number>                 Random seed for reproducible output
  -v, --verbose                   Show per-column generation stats
  -h, --help                      Show help
```

## schema.isomorph.json

The profile file contains the complete schema structure and aggregate statistics. Here's the format:

```json
{
  "isomorphdb_version": "1.0.0",
  "source_db": {
    "host": "db.xxx.supabase.co",
    "database": "postgres",
    "postgres_version": "15.1"
  },
  "tables": {
    "users": {
      "row_count": 48293,
      "columns": {
        "email": {
          "data_type": "character varying",
          "distribution": "UNIQUE",
          "null_ratio": 0,
          "cardinality": 48293,
          "min_length": 8,
          "max_length": 64
        }
      }
    }
  },
  "foreign_keys": [...],
  "enums": {...},
  "generation_order": ["users", "products", "orders", "order_items"]
}
```

## Supabase Quick Start

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project → **Settings** → **Database**
3. Copy the **Connection String** (URI format)
4. Run:

```bash
isomorphdb profile --db "postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"
isomorphdb morph --rows 10000
```

## Contributing

Contributions are welcome! Please:

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests for your changes
4. Ensure `npm test` passes
5. Submit a Pull Request

## License

IsomorphDB is dual-licensed:

- **Open Source**: GNU AGPLv3. See [LICENSE](LICENSE) for details.
- **Commercial**: For teams who need to embed IsomorphDB without AGPL obligations, a commercial license is available. See [COMMERCIAL_LICENSE.md](COMMERCIAL_LICENSE.md) for details.

## What's Coming (V2)

- ☁️ **Cloud sync** — share profiles across your team
- 🔄 **CI/CD integration** — `isomorphdb/morph-action` for GitHub Actions
- 🤖 **MCP server** — synthetic data for AI coding agents
- 🧠 **LLM coherence layer** — Ollama/Mistral for semantically valid data
- 🔌 **MySQL/SQLite support** — beyond Postgres
