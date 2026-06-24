/**
 * KeyValueWorker.ts
 * Implementation of a RegistryWorker for key-value registries.
 */

import { Response, Router } from "express";
import { Registry } from "../Registry";
import { RegistryWorker } from "./RegistryWorker";
import Database, { RunResult } from "better-sqlite3";
import path from "path";
import { mkdir, stat } from "fs/promises";
import { IllegalArgumentError } from "../../error/IllegalArgumentError";
import { DatabaseError } from "../../error/DatabaseError";
import { AuthedRegistryRequest, Authenticator } from "../../api/Authenticator";
import { ActorPermissions } from "../ActorPermissions";
import { asyncHandler } from "../../Utils";
import z from "zod";

enum AllowedTypes {
    STRING = "string",
    NUMBER = "number",
    BOOLEAN = "boolean",
    DATETIME = "datetime"
};

const EntryQuerySchema = z.object({
    id: z.number().int().positive().optional(),
    key: z.string().optional()
});

const EntryQueryKeySchema = z.object({
    key: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_]+$/)
});

const coerceDatatype = (input: string, type: AllowedTypes) => {
    switch (type) {
        case AllowedTypes.STRING:
            return input;
        case AllowedTypes.NUMBER:
            return parseFloat(input);
        case AllowedTypes.BOOLEAN:
            return ["true", "1"].includes(input.toLowerCase());
        case AllowedTypes.DATETIME:
            return new Date(input);
    }
}

export class KeyValueWorker extends RegistryWorker {

    #db: Database.Database | undefined;

    private dbGetQuery<T>(sql: string, args?: (string | number | Date)[]): Promise<T[]> {
        const stmt = this.#db?.prepare(sql);
        try {
            return Promise.resolve(stmt?.all(...(args || [])) as T[]);
        } catch (err) {
            throw new DatabaseError(`DB Get query failed\n${sql}\n`, err);
        }
    }

    private dbExecute(sql: string, args?: (string | number | Date)[]): Promise<RunResult> {
        const stmt = this.#db?.prepare(sql);
        try {
            const result = stmt?.run(...(args || []));

            if (result == undefined) throw new Error(`result of SQL query is undefined`);
            return Promise.resolve(result);
        } catch (err) {
            throw new DatabaseError(`DB Execution statement failed\n${sql}\n`, err);
        }
    }

    /**
     * Constructor for the KeyValueWorker class.
     * @param registry the registry to create a key-value worker for
     */
    constructor(registry: Registry) {
        super(registry);
    }

    public async start(): Promise<void> {
        // create the directory if it does not exist
        if (!process.env.STORAGE_ROOT_LOCATION) throw new IllegalArgumentError("Registry storage root is not set.");
        await mkdir(path.join(process.env.STORAGE_ROOT_LOCATION, this.registry.storageLocation), { recursive: true });

        // Start the DB worker
        this.#db = new Database(path.join(process.env.STORAGE_ROOT_LOCATION, this.registry.storageLocation, "db.sqlite"));
        this.#db.pragma("FOREIGN_KEYS = ON;");

        // If this is the first initialization ever, create the tables
        await this.dbExecute(
        `CREATE TABLE IF NOT EXISTS data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key VARCHAR(64) NOT NULL UNIQUE,
            datatype VARCHAR(16) NOT NULL CHECK (datatype IN ('string', 'number', 'boolean', 'datetime')),
            value VARCHAR(255) NOT NULL
        )`);

        return;
    }

    public stop(): Promise<void> {
        this.#db?.close();
        return Promise.resolve();
    }

    public registerRoutes(authenticator: Authenticator): Router {
        const router = Router();
        const actorAuthenticate = authenticator.actorAuthenticate.bind(authenticator);
        const requiredRegistryActorPermissions = authenticator.requiredRegistryActorPermissions.bind(authenticator, this.registry.id);

        // Get all key-value pairs, or query
        router.get("/data", actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.READ_REGISTRY ]), asyncHandler(async (req: AuthedRegistryRequest, res: Response) => {
            // get key-value pair by id, key
            const { id, key } = EntryQuerySchema.parse(req.query);

            if (id) {
                const result = await this.dbGetQuery<{ id: number, key: string, type: AllowedTypes, value: string }>(`
                    SELECT id, key, datatype AS type, value FROM data WHERE id = ?`, [ id ]);

                if (!result[0]) return res.status(404).json({ message: `ID ${id} not found.` });
                result[0].value = coerceDatatype(result[0].value, result[0].type) as string;

                return res.status(200).json(result[0]);
            }

            if (key) {
                const result = await this.dbGetQuery<{ id: number, key: string, type: AllowedTypes, value: string }>(`
                    SELECT id, key, datatype AS type, value FROM data WHERE key = ?`, [ key ]);

                if (!result[0]) return res.status(404).json({ message: `Key ${key} not found.` });
                result[0].value = coerceDatatype(result[0].value, result[0].type) as string;

                return res.status(200).json(result[0]);
            }

            const result = await this.dbGetQuery<{ id: number, key: string, type: AllowedTypes, value: string }>(`
                SELECT id, key, datatype AS type, value FROM data;`);

            res.status(200).json(result.map(r => ({ ...r, value: coerceDatatype(r.value, r.type) })));
        }));

        // set key-value pair
        router.put("/data/:key", actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.WRITE_REGISTRY ]), asyncHandler(async (req: AuthedRegistryRequest, res: Response) => {

        }));

        // delete key-value pair
        router.delete("/data/:key", actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.WRITE_REGISTRY ]), asyncHandler(async (req: AuthedRegistryRequest, res: Response) => {

        }))

        return router;
    }
}