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
        this.#rootStorage = path.join(storageRoot, this.registry.storageLocation);
        await mkdir(this.#rootStorage, { recursive: true });
    }

    public stop(): Promise<void> {
        // TODO: implement
        return Promise.resolve();
    }

    private async writeFileAtPath(content: string | NodeJS.ArrayBufferView, rootStorage: string, filePath: string, res: Response): Promise<boolean> {
        // prevent path traversal
        const resolved = path.resolve(rootStorage, filePath);
        if (!resolved.startsWith(rootStorage)) {
            res.status(403).json({ message: "Illegal path" });
            return false;
        }

        await mkdir(path.dirname(resolved), { recursive: true });
        await writeFile(resolved, content);

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
                        accessedAt: stats.atime
                    })
                } catch (err: any) {
                    if (!handleFsError(err, res)) throw err;
                }
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
            if (await this.writeFileAtPath(req.body, rootStorage, filePath.join("/"), res)) res.status(201).json({ message: "Successfully uploaded file" });
        }));

        // upload via multipart
        router.put(`/files/*filepath`, actorAuthenticate, requiredRegistryActorPermissions([ ActorPermissions.WRITE_REGISTRY ]), upload.single("file"), asyncHandler(async (req: AuthedActorRequest, res: Response) => {
            const filePath = req.params.filepath;
            if (!filePath || typeof filePath != "object") return res.status(400).json({ message: "Invalid file path" });

            if (!req.file) return res.status(400).json({ message: "File is missing" });
            if (await this.writeFileAtPath(req.file.buffer, rootStorage, filePath.join("/"), res)) res.status(201).json({ message: "Successfully uploaded file" });
        }));

        // delete
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
                    return res.status(200).json({ message: "Deleted directory successfully" });
                }

                await unlink(resolved);
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