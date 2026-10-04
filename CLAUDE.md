# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — nodemon watches `src/`, recompiles with `tsc`, and runs `dist/index.js`
- `npm run build` — compile TypeScript (`src/` → `dist/`, strict mode, CommonJS, ES2022)
- `npm start` — build then run

No test suite, linter, or formatter is configured. Use `npx tsc --noEmit` to type-check.

`tsc` does not clean `dist/`, so it can contain old output for files that have since been removed from `src/`.

## Runtime dependencies & environment

- `src/index.ts` hardcodes `DEV_ENV = true`, which loads `.env.dev`. Set it to `false` to load `.env.prod`.
- Required env vars: `DB_API_KEY`, `DB_HOST`, `DB_PORT`, `JWT_SECRET`, `NODE_ENV`, `PORT`, `STORAGE_ROOT_LOCATION`.
- **This service has no database of its own for users/registries/permissions.** All of that state lives in a separate database HTTP API at `http://$DB_HOST:$DB_PORT/api/v1`, called through an Axios instance (`dbApi`, created in `initDB.ts`) that sends an `x-api-key` header. That API must be running for the app to start.
- Per-registry data is stored on local disk under `$STORAGE_ROOT_LOCATION/registries/<uuid>/`, mostly in a per-registry SQLite file (`better-sqlite3`).
- Deployment: every push to `main` builds a Docker image, pushes it to GHCR, and redeploys it to the VM over SSH (`.github/workflows/deploy.yml`). Pushing to `main` deploys to production.

## Architecture

Express 5 + TypeScript backend for a "DMP Registry" system. Users create **registries** of different types. Each registry exposes its own data API, which users (via a JWT cookie) or **agents** (via an API key) can access.

### Startup wiring (`src/index.ts`)
Dependencies are wired by hand in `index.ts`. There is no DI container. The order is:
1. Create `dbApi`, then build the services from it.
2. `verifyPermissionsExist.ts` creates any `UserPermissions`/`ActorPermissions` enum values that are missing from the DB API. To add a permission, add it to the enum and it is created on the next boot.
3. `initAPI` sets up the Express app (CORS allowlist, helmet, rate limiting, JSON body parsing) and mounts `/api/v1/users` and `/api/v1/registries`.
4. `RegistryWorkerServiceImpl` is created and injected back into `RegistryLifecycleServiceImpl` through `setWorkerService`. This is a circular dependency, so lifecycle methods throw `IllegalStateError` until it is set.
5. One worker is started for every existing registry. SIGINT/SIGTERM/SIGHUP stop all workers.

### Layers
- `src/api/`: Router classes (`*RouterAPI.ts`) with a `registerRoutes(): Router` method. Request validation uses zod schemas in `api/schema/`; call `Schema.parse(req.params/body/query)` inside the handler and let `ZodError` reach `errorHandler`, which returns a 400. Wrap async handlers in `asyncHandler` from `Utils.ts`.
- `src/services/`: Each service has an interface `XService.ts` and an implementation `XServiceImpl.ts`. Code depends on the interface. Most implementations are thin wrappers around `dbApi` calls that map Axios 404s and error codes to domain errors.
- `src/model/`: Domain classes use `#private` fields, getters, a zod-validated static `fromObject()`, and `toDictionary()`. JSON responses are built from `toDictionary()`, not from the instance itself.
- `src/error/`: Subclasses of `WebRequestError` carry an HTTP status, which `api/errorHandler.ts` returns as the response code. Any other error becomes a 500 (with the stack trace only when `NODE_ENV=development`).

### Auth & permissions (`api/Authenticator.ts`)
There are two levels of permissions:
- **User permissions** (`UserPermissions`): global, such as `CREATE_REGISTRY`. Checked with `requiredPermissions([...])`.
- **Actor permissions** (`ActorPermissions`): granted per registry to a user or an agent, such as `READ_REGISTRY` and `WRITE_AGENTS`. Checked with `requiredRegistryPermissions` (users only) or `requiredRegistryActorPermissions` (users or agents). These read `:registryId` from the route params unless an explicit ID is passed. They also attach `req.registry` and `req.actorPermissions`.

Authentication middleware:
- `authenticate`: verifies the JWT from the `token` cookie. The token's `token_version` must match the user's current `tokenVersion`; incrementing it revokes the token.
- `agentAuthenticate`: checks the `x-api-key` header.
- `actorAuthenticate`: uses whichever of the two the request carries.

Request types are `AuthedRequest`, `AuthedRegistryRequest`, `AuthedActorRequest`, and `AuthedRegistryActorRequest`. Router classes bind the authenticator's methods in their constructors.

### Registry workers (dynamic per-registry routes)
- `model/workers/RegistryWorker.ts` is the abstract base class, with `start()`, `stop()`, and `registerRoutes(authenticator)`. `RegistryWorkerServiceImpl.startWorker` creates a worker based on `RegistryType` (`files`, `mongodb`, `sqlite`, `keyvalue`).
- A worker's router is mounted at `/r/<registryId>/api/v1` through `RouterRegistryServiceImpl`. Express can't remove routes, so the service installs a single dispatcher middleware for each path. On unassign it swaps in a blank router, which lets a path be reassigned later. Each worker router gets `errorHandler` attached.
- Implemented workers:
  - `KeyValueWorker`: a SQLite `data` table.
  - `FilesystemWorker`: files on disk under `<storage>/files/`, plus a SQLite `files` table that tracks metadata such as `is_public`. It serves `/hierarchy`, `/files/*filepath` (multipart upload or `/raw` body), and the unauthenticated `/public/*filepath`. Every path goes through `validateFilePath`.
- `MongoDBWorker` and `SQLiteWorker` are stubs.
- `initAPI.ts` skips the global JSON body parser for paths matching `/files/.../raw` so that raw uploads reach `express.raw`. Keep that in mind when adding body-handling routes.
- Creating a registry stores its record in the DB API, gives the creator every `ActorPermissions` value, and starts its worker. Deleting a registry stops the worker and runs `rm -rf` on its storage directory.
