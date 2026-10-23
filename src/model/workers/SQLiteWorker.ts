/**
 * SQLiteWorker.ts
 * Implementation of a registry worker for SQLite/Relational registries.
 *
 * Each registry is a single SQLite file holding user-defined STRICT tables. Every table gets an
 * `id INTEGER PRIMARY KEY` column, which the row routes use to address rows. Tables and rows are
 * managed through structured routes only: raw SQL is not accepted, because queries run
 * synchronously on the API process and statements like ATTACH/VACUUM INTO can reach other files.
 */

import { Response, Router } from "express";
import Database, { RunResult, SqliteError } from "better-sqlite3";
import path from "path";
import { mkdir } from "fs/promises";
import z from "zod";
import { AuthedRegistryActorRequest, Authenticator } from "../../api/Authenticator";
import { BadRequestError } from "../../error/BadRequestError";
import { DatabaseError } from "../../error/DatabaseError";
import { IllegalArgumentError } from "../../error/IllegalArgumentError";
import { asyncHandler } from "../../Utils";
import { ActorPermissions } from "../ActorPermissions";
import { Registry } from "../Registry";
import { RegistryWorker } from "./RegistryWorker";

enum ColumnType {
    INTEGER = "integer",
    REAL = "real",
    TEXT = "text"
};

const MAX_TEXT_LENGTH = 10000;

// Table and column names are interpolated into SQL (quoted), so they are restricted to plain identifiers
const Identifier = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/, { message: "Names must start with a letter or underscore and contain only letters, numbers and underscores (max 64)." })
    .refine(name => !name.toLowerCase().startsWith("sqlite_"), { message: "Names may not start with 'sqlite_'." });

const ColumnDefinitionSchema = z.object({
    name: Identifier.refine(name => name.toLowerCase() !== "id", { message: "'id' is created automatically." }),
    type: z.enum(ColumnType),
    notNull: z.boolean().default(false),
    unique: z.boolean().default(false)
});

const CreateTableSchema = z.object({
    name: Identifier,
    columns: z.array(ColumnDefinitionSchema).min(1).max(64)
        .refine(cols => new Set(cols.map(c => c.name.toLowerCase())).size === cols.length, { message: "Column names must be unique." })
});

const TableParamSchema = z.object({
    table: Identifier
});

const RowParamSchema = z.object({
    table: Identifier,
    rowId: z.coerce.number().int().positive()
});

const RowsQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(1000).default(100),
    offset: z.coerce.number().int().min(0).default(0),
    orderBy: Identifier.optional(),
    order: z.enum([ "asc", "desc" ]).default("asc")
});

const RowBodySchema = z.object({
    values: z.record(z.string(), z.unknown())
});

interface ColumnInfo {
    name: string;
    type: ColumnType;
    notNull: boolean;
    unique: boolean;
    primaryKey: boolean;
}

const quote = (identifier: string) => `"${identifier}"`;

// Coerce an incoming JSON value to what the column stores. Empty strings and missing values become NULL.
const coerceValue = (value: unknown, column: ColumnInfo) => {
    if (value === null || value === undefined || value === "") return null;
    switch (column.type) {
        case ColumnType.INTEGER:
            if (typeof value === "boolean") return value ? 1 : 0;
            return z.coerce.number().int().parse(value);
        case ColumnType.REAL:
            return z.coerce.number().finite().parse(value);
        case ColumnType.TEXT:
            return z.coerce.string().max(MAX_TEXT_LENGTH).parse(value);
    }
}

export class SQLiteWorker extends RegistryWorker {

    #db: Database.Database | undefined;

    private dbGetQuery<T>(sql: string, args?: (string | number | null)[]): T[] {
        try {
            return this.#db!.prepare(sql).all(...(args || [])) as T[];
        } catch (err) {
            throw new DatabaseError(`DB Get query failed\n${sql}\n`, err);
        }
    }

    // Runs a write; constraint violations (UNIQUE, NOT NULL, type) are the caller's fault, so they become 400s
    private dbExecute(sql: string, args?: (string | number | null)[]): RunResult {
        try {
            return this.#db!.prepare(sql).run(...(args || []));
        } catch (err) {
            if (err instanceof SqliteError && err.code.startsWith("SQLITE_CONSTRAINT")) throw new BadRequestError(err.message);
            throw new DatabaseError(`DB Execution statement failed\n${sql}\n`, err);
        }
    }

    private tableExists(table: string): boolean {
        return this.dbGetQuery(`SELECT name FROM sqlite_schema WHERE type = 'table' AND name = ? AND name NOT LIKE 'sqlite_%';`, [ table ]).length > 0;
    }

    private getColumns(table: string): ColumnInfo[] {
        const uniqueColumns = new Set<string>();
        const indexes = this.dbGetQuery<{ name: string; unique: number }>(`PRAGMA index_list(${quote(table)});`);
        for (const index of indexes.filter(i => i.unique)) {
            const indexColumns = this.dbGetQuery<{ name: string }>(`PRAGMA index_info(${quote(index.name)});`);
            if (indexColumns.length === 1) uniqueColumns.add(indexColumns[0].name);
        }

        return this.dbGetQuery<{ name: string; type: string; notnull: number; pk: number }>(`PRAGMA table_info(${quote(table)});`).map(c => ({
            name: c.name,
            type: c.type.toLowerCase() as ColumnType,
            notNull: c.notnull === 1 || c.pk === 1,
            unique: c.pk === 1 || uniqueColumns.has(c.name),
            primaryKey: c.pk === 1
        }));
    }

    private requireTable(table: string): ColumnInfo[] {
        if (!this.tableExists(table)) throw new BadRequestError(`Table '${table}' does not exist.`);
        return this.getColumns(table);
    }

    // Validate a row body against the table's columns, returning [column, value] pairs to write
    private parseRowValues(values: Record<string, unknown>, columns: ColumnInfo[]): [string, string | number | null][] {
        const writable = new Map(columns.filter(c => !c.primaryKey).map(c => [ c.name, c ]));
        return Object.entries(values).map(([ name, value ]) => {
            const column = writable.get(name);
            if (!column) throw new BadRequestError(`Unknown or read-only column '${name}'.`);
            try {
                return [ name, coerceValue(value, column) ];
            } catch {
                throw new BadRequestError(`Value for '${name}' is not a valid ${column.type}.`);
            }
        });
    }

    /**
     * Constructor for the SQLiteWorker class.
     * @param registry the registry to run the worker for
     */
    constructor(registry: Registry) {
        super(registry);
    }

    public async start(): Promise<void> {
        if (!process.env.STORAGE_ROOT_LOCATION) throw new IllegalArgumentError("Registry storage root is not set.");
        await mkdir(path.join(process.env.STORAGE_ROOT_LOCATION, this.registry.storageLocation), { recursive: true });

        this.#db = new Database(path.join(process.env.STORAGE_ROOT_LOCATION, this.registry.storageLocation, "db.sqlite"));
        this.#db.pragma("foreign_keys = ON");
        this.#db.pragma("journal_mode = WAL");
    }

    public stop(): Promise<void> {
        this.#db?.close();
        return Promise.resolve();
    }

    public registerRoutes(authenticator: Authenticator): Router {
        const router = Router();
        const actorAuthenticate = authenticator.actorAuthenticate.bind(authenticator);
        const requiredRegistryActorPermissions = authenticator.requiredRegistryActorPermissions.bind(authenticator, this.registry.id);

        // List tables with their columns and row counts
        router.get("/tables", actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.READ_REGISTRY ]), asyncHandler(async (req: AuthedRegistryActorRequest, res: Response) => {
            const tables = this.dbGetQuery<{ name: string }>(`SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;`);
            res.status(200).json(tables.map(({ name }) => ({
                name,
                columns: this.getColumns(name),
                rowCount: this.dbGetQuery<{ n: number }>(`SELECT COUNT(*) AS n FROM ${quote(name)};`)[0].n
            })));
        }));

        // Create a table
        router.post("/tables", actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.WRITE_REGISTRY ]), asyncHandler(async (req: AuthedRegistryActorRequest, res: Response) => {
            const { name, columns } = CreateTableSchema.parse(req.body);
            if (this.tableExists(name)) return res.status(409).json({ error: `Table '${name}' already exists.` });

            const definitions = [
                `${quote("id")} INTEGER PRIMARY KEY`,
                ...columns.map(c => `${quote(c.name)} ${c.type.toUpperCase()}${c.notNull ? " NOT NULL" : ""}${c.unique ? " UNIQUE" : ""}`)
            ];
            this.dbExecute(`CREATE TABLE ${quote(name)} (${definitions.join(", ")}) STRICT;`);
            res.status(201).json({ message: "Table created successfully." });
        }));

        // Drop a table (idempotent)
        router.delete("/tables/:table", actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.WRITE_REGISTRY ]), asyncHandler(async (req: AuthedRegistryActorRequest, res: Response) => {
            const { table } = TableParamSchema.parse(req.params);
            if (!this.tableExists(table)) return res.status(200).json({ message: "No changes made." });
            this.dbExecute(`DROP TABLE ${quote(table)};`);
            res.status(200).json({ message: "Table dropped successfully." });
        }));

        // Page through a table's rows
        router.get("/tables/:table/rows", actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.READ_REGISTRY ]), asyncHandler(async (req: AuthedRegistryActorRequest, res: Response) => {
            const { table } = TableParamSchema.parse(req.params);
            const { limit, offset, orderBy, order } = RowsQuerySchema.parse(req.query);
            const columns = this.requireTable(table);
            if (orderBy && !columns.some(c => c.name === orderBy)) throw new BadRequestError(`Unknown column '${orderBy}'.`);

            const rows = this.dbGetQuery(`SELECT * FROM ${quote(table)} ORDER BY ${quote(orderBy ?? "id")} ${order.toUpperCase()} LIMIT ? OFFSET ?;`, [ limit, offset ]);
            const total = this.dbGetQuery<{ n: number }>(`SELECT COUNT(*) AS n FROM ${quote(table)};`)[0].n;
            res.status(200).json({ columns, rows, total, limit, offset });
        }));

        // Insert a row
        router.post("/tables/:table/rows", actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.WRITE_REGISTRY ]), asyncHandler(async (req: AuthedRegistryActorRequest, res: Response) => {
            const { table } = TableParamSchema.parse(req.params);
            const { values } = RowBodySchema.parse(req.body);
            const entries = this.parseRowValues(values, this.requireTable(table));

            const result = entries.length === 0
                ? this.dbExecute(`INSERT INTO ${quote(table)} DEFAULT VALUES;`)
                : this.dbExecute(`INSERT INTO ${quote(table)} (${entries.map(([ c ]) => quote(c)).join(", ")}) VALUES (${entries.map(() => "?").join(", ")});`, entries.map(([ , v ]) => v));
            res.status(201).json({ message: "Row created successfully.", id: Number(result.lastInsertRowid) });
        }));

        // Update some columns of a row
        router.put("/tables/:table/rows/:rowId", actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.WRITE_REGISTRY ]), asyncHandler(async (req: AuthedRegistryActorRequest, res: Response) => {
            const { table, rowId } = RowParamSchema.parse(req.params);
            const { values } = RowBodySchema.parse(req.body);
            const entries = this.parseRowValues(values, this.requireTable(table));
            if (entries.length === 0) return res.status(400).json({ error: "No values provided." });

            const result = this.dbExecute(`UPDATE ${quote(table)} SET ${entries.map(([ c ]) => `${quote(c)} = ?`).join(", ")} WHERE id = ?;`, [ ...entries.map(([ , v ]) => v), rowId ]);
            if (result.changes === 0) return res.status(404).json({ error: `Row ${rowId} not found.` });
            res.status(200).json({ message: "Row updated successfully." });
        }));

        // Delete a row (idempotent)
        router.delete("/tables/:table/rows/:rowId", actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.WRITE_REGISTRY ]), asyncHandler(async (req: AuthedRegistryActorRequest, res: Response) => {
            const { table, rowId } = RowParamSchema.parse(req.params);
            this.requireTable(table);
            const result = this.dbExecute(`DELETE FROM ${quote(table)} WHERE id = ?;`, [ rowId ]);
            res.status(200).json({ message: result.changes > 0 ? "Row deleted successfully." : "No changes made." });
        }));

        return router;
    }
}
