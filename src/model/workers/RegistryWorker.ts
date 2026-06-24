/**
 * RegistryWorker.ts
 * Contains an abstract class that should be implemented by all registry workers.
 */

import { Router } from "express";
import { Registry } from "../Registry";
import { v4 } from "uuid";
import { Authenticator } from "../../api/Authenticator";

export abstract class RegistryWorker {

    protected readonly registry: Registry;
    protected readonly id: string;

    /**
     * Constructor for the RegistryWorker abstract class. Only to be called by subclasses.
     * Creates a UUID for this lifecycle.
     * @param registry the registry that this worker should be for
     */
    constructor(registry: Registry) {
        this.registry = registry;
        this.id = v4();
    }

    /**
     * Gets the ID of the registry worker
     * @returns the id of the registry worker
     */
    public getId(): string {
        return this.id;
    }

    /**
     * Registers the API routes for the registry worker
     * @returns the router
     */
    public abstract registerRoutes(authenticator: Authenticator): Router;

    /**
     * Starts the registry worker
     * @returns a promise that resolves if the registry worker successfully started
     */
    public abstract start(): Promise<void>;

    /**
     * Stops the registry worker
     * @returns a promise that resolves if the registry worker stops
     */
    public abstract stop(): Promise<void>;

}