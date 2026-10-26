# DMP Registry Backend

![DMP Registry cover](images/cover.png)

DMP Registry is a self-hosted platform for creating storage "registries" and controlling who can use each one. A registry is a file store, a typed key-value store, a SQLite database, or a MongoDB database. Access is granted per registry to signed-in users and to API-key "agents", so a program can read and write a registry without a user account.

This repo is the Express API that the frontend and agents talk to. It handles accounts, permissions, and registry lifecycle, and it serves each registry's own data API. The other two services are:

- [dmp-registry-frontend](https://github.com/dylan-mccormick/dmp-registry-frontend): the React web app
- [dmp-registry-db-api](https://github.com/dylan-mccormick/dmp-registry-db-api): an internal HTTP API over the MySQL database that holds users, registries, agents, and permissions

## Features

- Username and password accounts. Passwords are hashed with bcrypt, and sessions are a JWT in an `httpOnly` cookie that lasts two days.
- Logging out bumps the user's token version, which revokes every token issued before it.
- Four registry types, each with its own data API:
  - **Files**: upload, download, create folders, delete, and read file metadata. Any file can be marked public, which serves it without authentication.
  - **Key-value**: keys with a fixed type (`string`, `number`, `boolean`, `date`, `time`, `datetime`). Values are checked against the key's type on write.
  - **SQLite**: create and drop tables with `integer`, `real`, and `text` columns, then page through, insert, update, and delete rows. There is no raw SQL route.
  - **MongoDB**: create and drop collections, and list, filter, insert, replace, and delete documents as relaxed Extended JSON. `$where`, `$function`, and `$accumulator` are rejected.
- Per-registry agents with generated 128-character API keys that can be rotated. Only a SHA-256 hash of each key is stored, so a key is shown once, when it's created or rotated. On startup, any key still stored from before hashing was added is hashed in place, so existing agents keep working.
- Registry owners can rename or delete their registry. Deleting requires the owner's password.
- Admin endpoints to list all users and all registries, edit or delete users, and grant global permissions.

## Architecture

```
frontend ──► backend (this repo) ──► db-api ──► MySQL
agents   ──►    │
                ├──► per-registry SQLite files and uploads on local disk
                └──► MongoDB (optional, for MongoDB registries)
```

The backend has no database connection for its own state. Users, registries, agents, and permissions are all read and written through the db-api over HTTP with a shared `x-api-key`. Registry contents are stored by the backend itself:

| Registry type | Where its data lives |
|---|---|
| `files` | `$STORAGE_ROOT_LOCATION/registries/<uuid>/files/`, plus a SQLite table that tracks which files are public |
| `keyvalue` | A SQLite file in the registry's storage directory |
| `sqlite` | A SQLite file in the registry's storage directory |
| `mongodb` | A database named `dmp_registry_<id>` on the MongoDB server at `MONGO_URL` |

### Registry workers

Each registry runs as a worker object inside the API process. On startup, the backend starts one worker for every registry in the database. Creating a registry starts a new worker, and deleting one stops it, removes its storage directory, and drops its MongoDB database if it has one. None of this needs a restart.

A worker's routes are mounted at `/r/<registryId>/api/v1`. Express can't remove routes, so each path gets a single dispatcher middleware that forwards to the worker's current router. When a worker stops, its router is replaced with an empty one.

If `MONGO_URL` isn't set or MongoDB is unreachable, MongoDB workers still start, and their routes return 503.

## Permissions

There are two levels.

**Global user permissions** apply across the whole platform:

| Permission | Allows |
|---|---|
| `CREATE_REGISTRY` | Creating registries, and renaming or deleting ones you own |
| `MANAGE_USERS` | Listing, editing, and deleting users, granting global permissions, and listing all registries |

New accounts start with no global permissions.

**Registry permissions** are granted per registry to a user or an agent:

| Permission | Allows |
|---|---|
| `READ_REGISTRY` | Reading the registry's data |
| `WRITE_REGISTRY` | Changing the registry's data |
| `READ_AGENTS` | Viewing the registry's agents and their permissions |
| `WRITE_AGENTS` | Creating, renaming, deleting, and rotating keys for agents, and changing their permissions |
| `MANAGE_USERS` | Adding and removing users and changing their permissions on this registry |

A registry's creator gets all five. Both permission sets are defined as enums in `src/model/`, and any value missing from the database is created on startup.

All checks go through the `Authenticator` class in `src/api/Authenticator.ts`. Every registry data route uses the same `requiredRegistryActorPermissions` middleware, which works for a user (JWT cookie) or an agent (`x-api-key` header). Registry management routes under `/api/v1/registries` accept signed-in users only.

## API overview

All routes are JSON unless noted. Request bodies and parameters are validated with zod, and validation errors return 400.

### Users: `/api/v1/users`

| Method | Path | Notes |
|---|---|---|
| `POST` | `/register`, `/login`, `/logout` | Set or clear the `token` cookie |
| `GET` | `/auth/me`, `/permissions` | The current user and their global permissions |
| `PATCH` | `/update/me`, `/change-password/me` | Update your own account |
| `DELETE` | `/delete/me` | Requires your password |
| `GET` | `/list`, `/permissions/all`, `/:userId` | `MANAGE_USERS` |
| `PATCH`, `DELETE` | `/:userId` | `MANAGE_USERS` |
| `GET`, `POST`, `DELETE` | `/:userId/permissions[/:permission]` | `MANAGE_USERS` |

### Registries: `/api/v1/registries`

| Method | Path | Notes |
|---|---|---|
| `GET` | `/list/me` | Registries you can read |
| `GET` | `/list/all`, `/list/user/:userId` | `MANAGE_USERS` |
| `POST` | `/new` | `CREATE_REGISTRY`. Body: `name`, `type` |
| `PUT`, `DELETE` | `/:registryId` | Owner only. Delete requires the owner's password |
| `GET` | `/:registryId/details`, `/:registryId/permissions/me` | `READ_REGISTRY` |
| `GET` | `/:registryId/users`, `/:registryId/users/search` | Registry `MANAGE_USERS` |
| `POST`, `DELETE` | `/:registryId/users/:userId[/permissions]` | Registry `MANAGE_USERS` |
| `GET` | `/:registryId/agents[/:agentId[/permissions]]` | `READ_AGENTS` |
| `POST`, `PUT`, `DELETE` | `/:registryId/agents[/:agentId[/permissions]]` | `WRITE_AGENTS` |
| `PUT` | `/:registryId/agents/:agentId/key` | `WRITE_AGENTS`. Returns a new key |

### Registry data: `/r/<registryId>/api/v1`

Reads need `READ_REGISTRY` and writes need `WRITE_REGISTRY`.

| Type | Routes |
|---|---|
| Files | `GET /hierarchy`, `GET\|PUT\|DELETE /files/*path`, `GET /files/*path/meta`, `PUT /files/*path/raw`, `PATCH /files/*path/public?public=true`, `GET /public/*path` (no auth) |
| Key-value | `GET /data[?key=\|?id=]`, `PUT /data/:key`, `DELETE /data/:key` |
| SQLite | `GET\|POST /tables`, `DELETE /tables/:table`, `GET\|POST /tables/:table/rows`, `PUT\|DELETE /tables/:table/rows/:rowId` |
| MongoDB | `GET\|POST /collections`, `DELETE /collections/:collection`, `GET\|POST /collections/:collection/documents`, `PUT\|DELETE /collections/:collection/documents/:documentId` |

File uploads are limited to 50 MB. `PUT /files/*path` takes a multipart `file` field (or `?directory=true` to create a folder), and `PUT /files/*path/raw` takes the request body as the file's bytes.

For example, an agent can upload a file and make it public:

```sh
curl -X PUT "http://localhost:PORT/r/<registryId>/api/v1/files/site/index.html" \
  -H "x-api-key: $AGENT_KEY" -F "file=@dist/index.html"

curl -X PATCH "http://localhost:PORT/r/<registryId>/api/v1/files/site/index.html/public?public=true" \
  -H "x-api-key: $AGENT_KEY"
```

This is how the [ESP32 MCP Server](https://github.com/dylan-mccormick/esp-mcp-server)'s web app is hosted. Its [frontend](https://github.com/dylan-mccormick/esp-mcp-frontend)'s CI uploads the build to a files registry with an agent key and marks it public, and the board downloads the page from the public route and caches it on flash.

## Configuration

The backend reads these variables:

| Variable | Purpose |
|---|---|
| `PORT` | Port to listen on (defaults to 3000) |
| `NODE_ENV` | `production` sets the `secure` flag on the session cookie, and `development` includes stack traces in 500 responses |
| `JWT_SECRET` | Secret used to sign session tokens |
| `DB_HOST`, `DB_PORT` | Where the db-api is running |
| `DB_API_KEY` | Key sent to the db-api in the `x-api-key` header |
| `STORAGE_ROOT_LOCATION` | Root directory for registry files and SQLite databases |
| `MONGO_URL` | Optional. MongoDB connection string for MongoDB registries |

`src/index.ts` loads `.env.dev` when its `DEV_ENV` constant is `true` and `.env.prod` otherwise. Both files are gitignored. In Docker, the `.env` files are excluded from the image, and the variables come from the container's environment.

CORS allows `http://localhost` on any port, private `192.168.x.x` addresses, and the production domain. The API is rate limited to 120 requests per IP every two minutes.

## Running locally

Requirements: Node, plus a running db-api (and its MySQL database). The backend can't start without the db-api.

```sh
npm install
npm run dev     # recompile and restart on changes in src/
npm run build   # compile src/ to dist/
npm start       # build, then run dist/index.js
```

There's no test suite. Run `npx tsc --noEmit` to type-check.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`. It builds the Docker image (Node 25 Alpine, which compiles the TypeScript and runs `node dist/index.js` on port 3000), pushes it to GHCR as `dmp-registry-backend:latest`, and then connects to the server over SSH to run `docker compose pull backend` and `docker compose up -d backend`. The compose file mounts a volume for `STORAGE_ROOT_LOCATION` so registry data survives redeploys.
