/**
 * MongoDBWorker.ts
 * Implementation of a registry worker for MongoDB registries.
 *
 * Each registry gets its own database (`dmp_registry_<id>`) on the shared MongoDB server set by MONGO_URL.
 * Documents travel as relaxed Extended JSON, so ObjectIds and dates survive a read/edit/write round trip.
 * If MongoDB is not configured or unreachable the worker still starts; its routes answer 503 instead.
 */

import { Response, Router } from "express";
import { BSON, Db, MongoServerError, ObjectId } from "mongodb";
import z from "zod";
import { AuthedRegistryActorRequest, Authenticator } from "../../api/Authenticator";
import { BadRequestError } from "../../error/BadRequestError";
import { ServiceUnavailableError } from "../../error/ServiceUnavailableError";
import { getMongoClient } from "../../mongo";
import { asyncHandler } from "../../Utils";
import { ActorPermissions } from "../ActorPermissions";
import { Registry } from "../Registry";
import { RegistryWorker } from "./RegistryWorker";

const { EJSON } = BSON;

// Documents may use ObjectIds or plain strings as their _id
type RegistryDocument = { _id: ObjectId | string };

// Operators that run server-side JavaScript are never accepted from clients
const FORBIDDEN_OPERATORS = new Set([ "$where", "$function", "$accumulator" ]);

const CollectionName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/, { message: "Collection names must start with a letter or underscore and contain only letters, numbers, '_', '-' and '.' (max 64)." })
    .refine(name => !name.startsWith("system."), { message: "Collection names may not start with 'system.'." });

const CollectionParamSchema = z.object({
    collection: CollectionName
});

const DocumentParamSchema = z.object({
    collection: CollectionName,
    documentId: z.string().min(1).max(255)
});

const CreateCollectionSchema = z.object({
    name: CollectionName
});

const DocumentsQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(500).default(50),
    skip: z.coerce.number().int().min(0).default(0),
    filter: z.string().max(10000).optional()
});

const DocumentBodySchema = z.object({
    document: z.record(z.string(), z.unknown())
});

// Reject server-side JavaScript operators anywhere in a filter or document
const assertNoForbiddenOperators = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(assertNoForbiddenOperators);
    if (value === null || typeof value !== "object") return;
    for (const [ key, nested ] of Object.entries(value)) {
        if (FORBIDDEN_OPERATORS.has(key)) throw new BadRequestError(`The '${key}' operator is not allowed.`);
        assertNoForbiddenOperators(nested);
    }
}

// Parse client Extended JSON into BSON values
const fromExtendedJson = (value: unknown, what: string): Record<string, unknown> => {
    assertNoForbiddenOperators(value);
    try {
        return EJSON.deserialize(value as Record<string, unknown>, { relaxed: true });
    } catch {
        throw new BadRequestError(`The ${what} is not valid Extended JSON.`);
    }
}

// Ids that look like ObjectIds are matched as ObjectIds, anything else as a plain string
const parseDocumentId = (id: string): ObjectId | string => /^[0-9a-fA-F]{24}$/.test(id) ? new ObjectId(id) : id;

export class MongoDBWorker extends RegistryWorker {

    /**
     * Constructor for the MongoDBWorker class.
     * @param registry the registry to run the worker for
     */
    constructor(registry: Registry) {
        super(registry);
    }

    private get databaseName(): string {
        return `dmp_registry_${this.registry.id}`;
    }

    private async database(): Promise<Db> {
        const client = getMongoClient();
        if (!client) throw new ServiceUnavailableError("MongoDB is not configured on this server.");
        try {
            return (await client).db(this.databaseName);
        } catch (err) {
            console.error(`MongoDB is unreachable for registry ${this.registry.id}.`, err);
            throw new ServiceUnavailableError("MongoDB is currently unreachable.");
        }
    }

    private async requireCollection(db: Db, collection: string): Promise<void> {
        const found = await db.listCollections({ name: collection }, { nameOnly: true }).toArray();
        if (found.length === 0) throw new BadRequestError(`Collection '${collection}' does not exist.`);
    }

    public async start(): Promise<void> {
        // Never fail startup over MongoDB: a failed worker start takes down the whole API
        const client = getMongoClient();
        if (!client) {
            console.warn(`MONGO_URL is not set; MongoDB registry ${this.registry.id} will be unavailable.`);
            return;
        }
        await client.then(c => c.db(this.databaseName).command({ ping: 1 })).catch(err => {
            console.warn(`MongoDB registry ${this.registry.id} could not reach MongoDB at startup.`, err);
        });
    }

    public stop(): Promise<void> {
        // The client is shared between registries, so it stays open
        return Promise.resolve();
    }

    public async destroy(): Promise<void> {
        try {
            await (await this.database()).dropDatabase();
        } catch (err) {
            console.error(`Could not drop MongoDB database ${this.databaseName}; it must be removed manually.`, err);
        }
    }

    public registerRoutes(authenticator: Authenticator): Router {
        const router = Router();
        const actorAuthenticate = authenticator.actorAuthenticate.bind(authenticator);
        const requiredRegistryActorPermissions = authenticator.requiredRegistryActorPermissions.bind(authenticator, this.registry.id);

        // List collections with document counts
        router.get("/collections", actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.READ_REGISTRY ]), asyncHandler(async (req: AuthedRegistryActorRequest, res: Response) => {
            const db = await this.database();
            const collections = (await db.listCollections({}, { nameOnly: true }).toArray())
                .filter(c => !c.name.startsWith("system."))
                .sort((a, b) => a.name.localeCompare(b.name));

            res.status(200).json(await Promise.all(collections.map(async c => ({
                name: c.name,
                documentCount: await db.collection(c.name).estimatedDocumentCount()
            }))));
        }));

        // Create a collection
        router.post("/collections", actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.WRITE_REGISTRY ]), asyncHandler(async (req: AuthedRegistryActorRequest, res: Response) => {
            const { name } = CreateCollectionSchema.parse(req.body);
            const db = await this.database();
            // MongoDB 7+ treats creating an existing collection as a no-op, so check first
            if ((await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0) return res.status(409).json({ error: `Collection '${name}' already exists.` });
            try {
                await db.createCollection(name);
            } catch (err) {
                if (err instanceof MongoServerError && err.codeName === "NamespaceExists") return res.status(409).json({ error: `Collection '${name}' already exists.` });
                throw err;
            }
            res.status(201).json({ message: "Collection created successfully." });
        }));

        // Drop a collection (idempotent)
        router.delete("/collections/:collection", actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.WRITE_REGISTRY ]), asyncHandler(async (req: AuthedRegistryActorRequest, res: Response) => {
            const { collection } = CollectionParamSchema.parse(req.params);
            const dropped = await (await this.database()).dropCollection(collection).catch(err => {
                if (err instanceof MongoServerError && err.codeName === "NamespaceNotFound") return false;
                throw err;
            });
            res.status(200).json({ message: dropped ? "Collection dropped successfully." : "No changes made." });
        }));

        // Page through documents, optionally filtered by an Extended JSON query
        router.get("/collections/:collection/documents", actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.READ_REGISTRY ]), asyncHandler(async (req: AuthedRegistryActorRequest, res: Response) => {
            const { collection } = CollectionParamSchema.parse(req.params);
            const { limit, skip, filter: rawFilter } = DocumentsQuerySchema.parse(req.query);

            let filter: Record<string, unknown> = {};
            if (rawFilter) {
                let parsed: unknown;
                try {
                    parsed = JSON.parse(rawFilter);
                } catch {
                    throw new BadRequestError("The filter is not valid JSON.");
                }
                if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new BadRequestError("The filter must be a JSON object.");
                filter = fromExtendedJson(parsed, "filter");
            }

            const db = await this.database();
            await this.requireCollection(db, collection);
            const coll = db.collection(collection);
            try {
                const [ documents, total ] = await Promise.all([
                    coll.find(filter).sort({ _id: 1 }).skip(skip).limit(limit).toArray(),
                    coll.countDocuments(filter)
                ]);
                res.status(200).json({ documents: documents.map(d => EJSON.serialize(d, { relaxed: true })), total, limit, skip });
            } catch (err) {
                // Malformed queries (unknown operators, bad operands) are client errors
                if (err instanceof MongoServerError && err.code === 2) throw new BadRequestError(err.message);
                throw err;
            }
        }));

        // Insert a document
        router.post("/collections/:collection/documents", actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.WRITE_REGISTRY ]), asyncHandler(async (req: AuthedRegistryActorRequest, res: Response) => {
            const { collection } = CollectionParamSchema.parse(req.params);
            const { document } = DocumentBodySchema.parse(req.body);
            const parsed = fromExtendedJson(document, "document");

            const db = await this.database();
            await this.requireCollection(db, collection);
            try {
                const result = await db.collection(collection).insertOne(parsed);
                res.status(201).json({ message: "Document created successfully.", id: EJSON.serialize({ id: result.insertedId }, { relaxed: true }).id });
            } catch (err) {
                if (err instanceof MongoServerError && err.code === 11000) throw new BadRequestError("A document with this _id already exists.");
                throw err;
            }
        }));

        // Replace a document (its _id is kept)
        router.put("/collections/:collection/documents/:documentId", actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.WRITE_REGISTRY ]), asyncHandler(async (req: AuthedRegistryActorRequest, res: Response) => {
            const { collection, documentId } = DocumentParamSchema.parse(req.params);
            const { document } = DocumentBodySchema.parse(req.body);
            const replacement = fromExtendedJson(document, "document");
            delete replacement._id;

            const db = await this.database();
            await this.requireCollection(db, collection);
            const result = await db.collection<RegistryDocument>(collection).replaceOne({ _id: parseDocumentId(documentId) }, replacement);
            if (result.matchedCount === 0) return res.status(404).json({ error: `Document ${documentId} not found.` });
            res.status(200).json({ message: "Document updated successfully." });
        }));

        // Delete a document (idempotent)
        router.delete("/collections/:collection/documents/:documentId", actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.WRITE_REGISTRY ]), asyncHandler(async (req: AuthedRegistryActorRequest, res: Response) => {
            const { collection, documentId } = DocumentParamSchema.parse(req.params);
            const db = await this.database();
            await this.requireCollection(db, collection);
            const result = await db.collection<RegistryDocument>(collection).deleteOne({ _id: parseDocumentId(documentId) });
            res.status(200).json({ message: result.deletedCount > 0 ? "Document deleted successfully." : "No changes made." });
        }));

        return router;
    }
}
