/**
 * MongoDBWorker.ts
 * Implementation of a registry worker for MongoDB registries.
 */

import { Router } from "express";
import { Authenticator } from "../../api/Authenticator";
import { Registry } from "../Registry";
import { RegistryWorker } from "./RegistryWorker";

export class MongoDBWorker extends RegistryWorker {

    /**
     * Constructor for the MongoDBWorker class.
     * @param registry the registry to run the worker for
     */
    constructor(registry: Registry) {
        super(registry);
    }

    public start(): Promise<void> {
        // TODO: implement
        return Promise.resolve();
    }

    public stop(): Promise<void> {
        // TODO: implement
        return Promise.resolve();
    }

    public registerRoutes(authenticator: Authenticator): Router {
        // TODO: implement
        return Router();
    }
}