/**
 * KeyValueWorker.ts
 * Implementation of a RegistryWorker for key-value registries.
 */

import { Response, Router } from "express";
import { Registry } from "../Registry";
import { RegistryWorker } from "./RegistryWorker";
import Database, { RunResult } from "better-sqlite3";
import path from "path";
import { mkdir } from "fs/promises";
import { IllegalArgumentError } from "../../error/IllegalArgumentError";
import { DatabaseError } from "../../error/DatabaseError";
import { AuthedRegistryActorRequest, Authenticator } from "../../api/Authenticator";
import { ActorPermissions } from "../ActorPermissions";
import { asyncHandler } from "../../Utils";
import z from "zod";

enum AllowedTypes {
    STRING = "string",
    NUMBER = "number",
    BOOLEAN = "boolean",
    DATE = "date",
    TIME = "time",
    DATETIME = "datetime"
};

const EntryType = z.object({
    id: z.coerce.number().int().positive(),
    key: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_]+$/),
    type: z.enum(AllowedTypes),
    value: z.string().max(255)
});

type EntryType = z.infer<typeof EntryType>;

const EntryQuerySchema = z.object({
    id: z.coerce.number().int().positive().optional(),
    key: z.string().optional()
});

const EntryQueryKeySchema = z.object({
    key: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_]+$/)
});

const CreateUpdateKeySchema = z.object({
    type: z.enum(AllowedTypes).optional(),
    value: z.coerce.string()
})

const coerceDatatype = (input: string, type: AllowedTypes) => {
    switch (type) {
        case AllowedTypes.STRING:
            return z.string().max(255).parse(input);
        case AllowedTypes.NUMBER:
            return z.coerce.number().parse(input);
        case AllowedTypes.BOOLEAN:
            return z.union([z.boolean(), z.number(), z.string()])
                .transform(v => {
                    if (typeof v === 'boolean') return v;
                    if (v === 'true' || v === '1' || v == 1) return true;
                    if (v === 'false' || v === '0' || v == 0) return false;
                    throw new Error(`Cannot coerce ${v} to boolean`);
                }).parse(input);
        case AllowedTypes.DATETIME:
            return z.coerce.date().parse(input);
        case AllowedTypes.DATE:
            return z.iso.date().parse(input);
        case AllowedTypes.TIME:
            return z.iso.time().parse(input);
    }
}

export class KeyValueWorker extends RegistryWorker {

    #db: Database.Database | undefined;

    private dbGetQuery<T>(sql: string, args?: (string | number | boolean | Date)[]): Promise<T[]> {
        const stmt = this.#db?.prepare(sql);
        try {
            return Promise.resolve(stmt?.all(...(args || [])) as T[]);
        } catch (err) {
            throw new DatabaseError(`DB Get query failed\n${sql}\n`, err);
        }
    }

    private dbExecute(sql: string, args?: (string | number | boolean | Date)[]): Promise<RunResult> {
        const fixedArgs = z.array(z.transform((a: string | number | boolean | Date) => {
            if (typeof a == "boolean") return (a && 1 || 0);
            if (a instanceof Date) return a.toISOString();
            return a;
        })).optional().parse(args);

        const stmt = this.#db?.prepare(sql);
        try {
            const result = stmt?.run(...(fixedArgs || []));

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
            datatype VARCHAR(16) NOT NULL CHECK (datatype IN ('string', 'number', 'boolean', 'date', 'time', 'datetime')),
            value VARCHAR(255) NOT NULL
        );`);

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
        router.get("/data", actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.READ_REGISTRY ]), asyncHandler(async (req: AuthedRegistryActorRequest, res: Response) => {
            // get key-value pair by id, key
            const { id, key } = EntryQuerySchema.parse(req.query);

            if (id) {
                const result = z.array(EntryType).parse(await this.dbGetQuery<EntryType>(`
                    SELECT id, key, datatype AS type, value FROM data WHERE id = ?;`, [ id ]));

                if (!result[0]) return res.status(404).json({ message: `ID ${id} not found.` });
                result[0].value = coerceDatatype(result[0].value, result[0].type) as string;

                return res.status(200).json(result[0]);
            }

            if (key) {
                const result = z.array(EntryType).parse(await this.dbGetQuery<EntryType>(`
                    SELECT id, key, datatype AS type, value FROM data WHERE key = ?;`, [ key ]));

                if (!result[0]) return res.status(404).json({ message: `Key ${key} not found.` });
                result[0].value = coerceDatatype(result[0].value, result[0].type) as string;

                return res.status(200).json(result[0]);
            }

            const result = z.array(EntryType).parse(await this.dbGetQuery<EntryType>(`
                SELECT id, key, datatype AS type, value FROM data;`));

            res.status(200).json(result.map(r => ({ ...r, value: coerceDatatype(r.value, r.type) })));
        }));

        // set key-value pair
        router.put("/data/:key", actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.WRITE_REGISTRY ]), asyncHandler(async (req: AuthedRegistryActorRequest, res: Response) => {
            const { key } = EntryQueryKeySchema.parse(req.params);
            const { type, value } = CreateUpdateKeySchema.parse(req.body);

            // determine if key exists
            const result = (await this.dbGetQuery<EntryType>(`SELECT id, key, datatype AS type, value FROM data WHERE key = ?;`, [ key ]))[0];

            if (!result) {
                if (!type) {
                    return res.status(400).json({ message: "A 'type' body parameter is required to specify the data type that will be stored." });
                }

                // we are inserting a new key
                let coerced;
                try {
                    coerced = coerceDatatype(value, type);
                } catch (err) {
                    return res.status(400).json({ message: "The provided value cannot be coerced into the requested type." });
                }

                await this.dbExecute(`INSERT INTO data(key, datatype, value) VALUES (?, ?, ?);`, [ key, type.toString(), coerced ]);
                return res.status(201).json({ message: "Key created successfully." });
            };

            // verify the data type is not changed
            if (type && type != result.type) {
                return res.status(400).json({ message: "The type of the key cannot change. Delete the key first." });
            }

            // verify data can be parsed
            let coerced;
            try {
                coerced = coerceDatatype(value, result.type);
            } catch (err) {
                return res.status(400).json({ message: "The provided value cannot be coerced into the requested type." });
            }

            await this.dbExecute(`
                UPDATE data
                    SET value = ?
                    WHERE key = ?`,
                [ coerced, key ]);
            return res.status(200).json({ message: "Key updated successfully." });
        }));

        // delete key-value pair
        router.delete("/data/:key", actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.WRITE_REGISTRY ]), asyncHandler(async (req: AuthedRegistryActorRequest, res: Response) => {
            const { key } = EntryQueryKeySchema.parse(req.params);

            // idempotent delete
            const result = await this.dbExecute(`DELETE FROM data WHERE key = ?;`, [ key ]);

            res.status(200).json({ message: result.changes > 0 ? "Key successfully removed." : "No changes made." });
        }))

        return router;
    }
}