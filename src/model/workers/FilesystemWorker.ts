/**
 * FilesystemWorker.ts
 * Implementation of a registry worker for filesystem registries.
 */

import { Router, Response, raw } from "express";
import { AuthedActorRequest, Authenticator } from "../../api/Authenticator";
import { Registry } from "../Registry";
import { RegistryWorker } from "./RegistryWorker";
import { ActorPermissions } from "../ActorPermissions";
import { asyncHandler } from "../../Utils";
import path from "node:path";
import fs from "fs/promises";
import { IllegalArgumentError } from "../../error/IllegalArgumentError";
import { mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { IllegalStateError } from "../../error/IllegalStateError";
import multer from "multer";
import Database, { RunResult } from "better-sqlite3";
import { DatabaseError } from "../../error/DatabaseError";
import z from "zod";

// File Hierarchy Information
interface FSNode { name: string; type: "file" | "directory"; children?: FSNode[]; };

const getDirectoryTree = async (loc: string): Promise<FSNode> => {
    const stats = await fs.stat(loc);
    let results: FSNode[] | undefined;

    if (stats.isDirectory()) {
        results = [];
        const contents = await fs.readdir(loc, { withFileTypes: true });
        await Promise.all(contents.map(async c => results?.push(await getDirectoryTree(path.join(loc, c.name)))));
    }

    const parentNode = { name: path.basename(loc), type: stats.isDirectory() ? "directory" : "file", children: results  } satisfies FSNode;
    return parentNode;
}

// filename validation
const validateFilePath = (filePath: string): boolean => {
    // no null bytes
    if (filePath.includes('\0')) return false;
    // no empty segments
    if (filePath.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) return false;
    // only allow safe characters
    if (!/^[a-zA-Z0-9._\-\/]+$/.test(filePath)) return false;
    // max length
    if (filePath.length > 255) return false;

    return true;
};

// For file uploading
const upload = multer({
    limits: { fileSize: 50 * 1024 * 1024 }, // 50mb
    storage: multer.memoryStorage()
});

// Handling FS errors
const handleFsError = (err: NodeJS.ErrnoException, res: Response): Response<any, Record<string, any>> | null => {
    switch (err.code) {
        case 'ENOENT':
            return res.status(404).json({ message: 'File not found' });
        case 'ENOTDIR':
            return res.status(400).json({ message: 'Path component is not a directory' });
        case 'EISDIR':
            return res.status(400).json({ message: 'Path is a directory, not a file' });
        case 'EACCES':
            return res.status(403).json({ message: 'Permission denied' });
        case 'EEXIST':
            return res.status(409).json({ message: 'File already exists' });
        case 'ENOSPC':
            return res.status(507).json({ message: 'Insufficient storage space' });
        case 'ENAMETOOLONG':
            return res.status(400).json({ message: 'File name too long' });
        case 'EMFILE':
            return res.status(503).json({ message: 'Server too busy, try again later' });
        default:
            return null;
    }
};

export class FilesystemWorker extends RegistryWorker {

    #rootStorage?: string;
    #db: Database.Database | undefined;

    private escapeLikePattern(value: string): string {
        return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
    }

    private dbGetQuery<T>(sql: string, args?: (string | number | boolean | Date)[]): Promise<T[]> {
        const stmt = this.#db?.prepare(sql);
        try {
            return Promise.resolve(stmt?.all(...(args || [])) as T[]);
        } catch (err) {
            throw new DatabaseError(`DB Get query failed\n${sql}\n`, err);
        }
    }

    private async addFileRecord(filePath: string): Promise<void> {
        await this.dbExecute(`DELETE FROM files WHERE path = ?`, [ filePath ]);
        await this.dbExecute(`INSERT INTO files (path) VALUES (?)`, [ filePath ]);
    }

    private async isFilePublic(filePath: string): Promise<boolean> {
        const rows = await this.dbGetQuery<{ is_public: number }>(
            `SELECT is_public FROM files WHERE path = ?;`,
            [ filePath ]
        );

        return rows[0]?.is_public === 1;
    }

    private async setFilePublic(filePath: string, isPublic: boolean): Promise<boolean> {
        const result = await this.dbExecute(`UPDATE files SET is_public = ? WHERE path = ?`, [ isPublic, filePath ]);
        return result.changes > 0;
    }

    private async removeFileRecords(filePath: string, directory: boolean): Promise<void> {
        if (directory) {
            const escapedPrefix = this.escapeLikePattern(filePath);
            await this.dbExecute(`DELETE FROM files WHERE path = ? OR path LIKE ? ESCAPE '\\'`, [ filePath, `${escapedPrefix}/%` ]);
            return;
        }

        await this.dbExecute(`DELETE FROM files WHERE path = ?`, [ filePath ]);
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
     * Constructor for the FilesystemWorker class.
     * @param registry the registry to run the worker for
     */
    constructor(registry: Registry) {
        super(registry);
    }

    public async start(): Promise<void> {
        // initialize root storage
        const storageRoot = process.env.STORAGE_ROOT_LOCATION;
        if (!storageRoot) throw new IllegalArgumentError("Registry storage root is not set.");
        this.#rootStorage = path.join(storageRoot, this.registry.storageLocation, "files");
        await mkdir(this.#rootStorage, { recursive: true });

        // Start the DB worker
        this.#db = new Database(path.join(this.#rootStorage, "..", "db.sqlite"));
        this.#db.pragma("FOREIGN_KEYS = ON;");

        // SQLite table for file info
        await this.dbExecute(`
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL,
                is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0, 1))
            );`);
        await this.dbExecute(`
            CREATE INDEX IF NOT EXISTS idx_files_path ON files (path);`);
    }

    public stop(): Promise<void> {
        this.#db?.close();
        return Promise.resolve();
    }

    private async writeFileAtPath(content: string | NodeJS.ArrayBufferView | null, rootStorage: string, filePath: string, res: Response, directoryOnly?: boolean): Promise<boolean> {
        // prevent path traversal
        const resolved = path.resolve(rootStorage, filePath);
        if (!resolved.startsWith(rootStorage)) {
            res.status(403).json({ message: "Illegal path" });
            return false;
        }

        // validate words
        if ((["/hierarchy", "/raw"]).some(c => resolved.toLowerCase().includes(c))) {
            res.status(403).json({ message: "Illegal word detected" });
            return false;
        }

        await mkdir(directoryOnly ? resolved : path.dirname(resolved), { recursive: true });
        if (!directoryOnly && content != null) await writeFile(resolved, content);

        return true;
    }

    public registerRoutes(authenticator: Authenticator): Router {
        const router = Router();
        const actorAuthenticate = authenticator.actorAuthenticate.bind(authenticator);
        const requiredRegistryActorPermissions = authenticator.requiredRegistryActorPermissions.bind(authenticator, this.registry.id);

        // capture root storage
        if (!this.#rootStorage) throw new IllegalStateError("Call start() before registering routes.");
        const rootStorage = this.#rootStorage;

        // get hierarchy information
        router.get(`/hierarchy`, actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.READ_REGISTRY ]), asyncHandler(async (req: AuthedActorRequest, res: Response) => {
            res.status(200).json(await getDirectoryTree(rootStorage));
        }));

        // get file
        router.get(`/files/*filepath`, actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.READ_REGISTRY ]), asyncHandler(async (req: AuthedActorRequest, res: Response) => {
            const filePath = req.params.filepath;
            const download = req.query.download === 'true';
            if (!filePath || typeof filePath != "object") return res.status(400).json({ message: "Invalid file path" });

            // prevent path traversal
            const resolved = path.resolve(rootStorage, filePath.join("/"));
            if (!resolved.startsWith(rootStorage)) {
                return res.status(403).json({ message: "Illegal path" });
            }

            // check if we are requesting only metadata
            if (resolved.endsWith("/meta")) {
                const targetFilePath = resolved.substring(0, resolved.length - 5);
                try {
                    const stats = await fs.stat(targetFilePath);
                    return res.status(200).json({
                        fName: targetFilePath.substring(targetFilePath.lastIndexOf("/") + 1),
                        directory: stats.isDirectory(),
                        size: stats.size,
                        createdAt: stats.birthtime,
                        modifiedAt: stats.mtime,
                        accessedAt: stats.atime,
                        isPublic: await this.isFilePublic(path.relative(rootStorage, targetFilePath))
                    })
                } catch (err: any) {
                    if (!handleFsError(err, res)) throw err;
                    return;
                }
            }

            // decide if we should download or just open the file, for frontend
            if (download) {
                res.setHeader('Content-Disposition', `attachment; filename="${path.basename(resolved)}"`);
            } else {
                res.setHeader('Content-Disposition', 'inline');
            }

            try {
                await fs.readFile(resolved); // verify path exists
                res.status(200).sendFile(resolved);
            } catch (err: any) {
                if (!handleFsError(err, res)) throw err;
            }
        }));

        // update public visibility
        router.patch(`/files/*filepath/public`, actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.WRITE_REGISTRY ]), asyncHandler(async (req: AuthedActorRequest, res: Response) => {
            const filePath = req.params.filepath;
            if (!filePath || typeof filePath != "object") return res.status(400).json({ message: "Invalid file path" });

            const isPublic = req.query.public === "true";
            const filePathString = filePath.join("/");
            const updated = await this.setFilePublic(filePathString, isPublic);
            if (!updated) return res.status(404).json({ message: "File not found" });

            res.status(200).json({ message: "Successfully updated file visibility", isPublic });
        }));

        // public file read
        router.get(`/public/*filepath`, asyncHandler(async (req: AuthedActorRequest, res: Response) => {
            const filePath = req.params.filepath;
            const download = req.query.download === 'true';
            if (!filePath || typeof filePath != "object") return res.status(400).json({ message: "Invalid file path" });

            const resolved = path.resolve(rootStorage, filePath.join("/"));
            if (!resolved.startsWith(rootStorage)) {
                return res.status(403).json({ message: "Illegal path" });
            }

            if (!(await this.isFilePublic(filePath.join("/")))) {
                return res.status(403).json({ message: "File is not public" });
            }

            if (download) {
                res.setHeader('Content-Disposition', `attachment; filename="${path.basename(resolved)}"`);
            } else {
                res.setHeader('Content-Disposition', 'inline');
            }

            try {
                await fs.readFile(resolved); // verify path exists
                res.status(200).sendFile(resolved);
            } catch (err: any) {
                if (!handleFsError(err, res)) throw err;
            }
        }));

        // upload raw bytes
        router.put(`/files/*filepath/raw`, actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.WRITE_REGISTRY ]), raw({ type: "*/*", limit: "50mb" }), asyncHandler(async (req: AuthedActorRequest, res: Response) => {
            const filePath = req.params.filepath;
            if (!filePath || typeof filePath != "object") return res.status(400).json({ message: "Invalid file path" });

            const filePathString = filePath.join("/");
            if (await this.writeFileAtPath(req.body, rootStorage, filePathString, res)) {
                try {
                    await this.addFileRecord(filePathString);
                    res.status(201).json({ message: "Successfully uploaded file" });
                } catch (err) {
                    await unlink(path.resolve(rootStorage, filePathString)).catch(() => undefined);
                    throw err;
                }
            }
        }));

        // upload via multipart
        router.put(`/files/*filepath`, actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.WRITE_REGISTRY ]), upload.single("file"), asyncHandler(async (req: AuthedActorRequest, res: Response) => {
            const filePath = req.params.filepath;
            const isDirectory = req.query.directory === "true";
            if (!filePath || typeof filePath != "object") return res.status(400).json({ message: "Invalid file path" });

            if (!req.file && !isDirectory) return res.status(400).json({ message: "File is missing" });

            const filePathString = filePath.join("/");
            if (await this.writeFileAtPath(isDirectory ? null : req.file!.buffer, rootStorage, filePathString, res, isDirectory)) {
                try {
                    if (!isDirectory) await this.addFileRecord(filePathString);
                    res.status(201).json({ message: "Successfully uploaded file" });
                } catch (err) {
                    const resolved = path.resolve(rootStorage, filePathString);
                    await rm(resolved, { recursive: isDirectory }).catch(() => undefined);
                    throw err;
                }
            }
        }));

        // delete
        // comment to refresh
        router.delete(`/files/*filepath`, actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.WRITE_REGISTRY ]), asyncHandler(async (req: AuthedActorRequest, res: Response) => {
            const filePath = req.params.filepath;
            if (!filePath || typeof filePath != "object") return res.status(400).json({ message: "Invalid file path" });

            // prevent path traversal
            const resolved = path.resolve(rootStorage, filePath.join("/"));
            if (!resolved.startsWith(rootStorage)) {
                return res.status(403).json({ message: "Illegal path" });
            }

            try {
                const stats = await fs.stat(resolved);
                if (stats.isDirectory()) {
                    await rm(resolved, { recursive: true });
                    await this.removeFileRecords(filePath.join("/"), true);
                    return res.status(200).json({ message: "Deleted directory successfully" });
                }

                await unlink(resolved);
                await this.removeFileRecords(filePath.join("/"), false);
                res.status(200).json({ message: "Deleted file successfully" });
            } catch (err: any) {
                if (err.code == "ENOENT") {
                    return res.status(304).json({ message: "No changes made" })
                }
                if (!handleFsError(err, res)) throw err;
            }
        }));

        return router;
    }
}