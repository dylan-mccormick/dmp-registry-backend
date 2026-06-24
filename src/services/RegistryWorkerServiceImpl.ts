/**
 * RegistryWorkerServiceImpl.ts
 * Implementation of the RegistryWorkerService interface contract.
 */

import { RegistryWorkerService } from "./RegistryWorkerService";
import { RegistryWorker } from "../model/workers/RegistryWorker";
import { Registry } from "../model/Registry";
import { IllegalStateError } from "../error/IllegalStateError";
import { RegistryType } from "../model/RegistryType";
import { KeyValueWorker } from "../model/workers/KeyValueWorker";
import { Router } from "express";
import { Authenticator } from "../api/Authenticator";
import { RouterRegistryService } from "./RouterRegistryService";

export class RegistryWorkerServiceImpl implements RegistryWorkerService {

    readonly #routerRegistryService: RouterRegistryService;
    readonly #workers: Map<number, RegistryWorker>;
    readonly #authenticator: Authenticator;

    /**
     * Constructor for the RegistryWorkerService class.
     */
    constructor(routerRegistryService: RouterRegistryService, authenticator: Authenticator) {
        this.#routerRegistryService = routerRegistryService;
        this.#workers = new Map<number, RegistryWorker>();
        this.#authenticator = authenticator;
    }

    public getActiveRegistryIds(): number[] {
        return [...this.#workers.keys()];
    }

    public getWorkerForRegistry(registryId: number): RegistryWorker | undefined {
        return this.#workers.get(registryId);
    }

    public async startWorker(registry: Registry): Promise<void> {
        if (this.getWorkerForRegistry(registry.id)) throw new IllegalStateError(`Registry worker for registry ${registry.id} ${registry.name} already exists.`);

        // Start specific worker
        const worker: RegistryWorker | undefined = (() => {switch (registry.type) {
            case RegistryType.files:
                // TODO
                return undefined;
            case RegistryType.mongoDB:
                // TODO
                return undefined;
            case RegistryType.sqlite:
                // TODO
                return undefined;
            case RegistryType.keyValue:
                return new KeyValueWorker(registry);
            default:
                return undefined;
        }})();

        if (!worker) throw new Error("Fatal implementation error: Worker does not exist.");

        await worker.start();

        // Register the appropriate routes
        const router = worker.registerRoutes(this.#authenticator);
        this.#routerRegistryService.assign(`/r/${registry.id}/api/v1`, router);

        this.#workers.set(registry.id, worker);

        return;
    }

    public async stopWorker(registryId: number): Promise<boolean> {
        if (!this.#workers.get(registryId)) Promise.resolve(false);

        this.#routerRegistryService.unassign(`/r/${registryId}/api/v1`);
        await this.#workers.get(registryId)?.stop();

        return true;
    }

    public async bulkStartWorkers(registries: Registry[]): Promise<void> {
        throw new Error("Not implemented");
    }

    public async bulkStopWorkers(registryIds: number[]): Promise<void> {
        registryIds.forEach(rid => this.#routerRegistryService.unassign(`/r/${rid}/api/v1`));
        await Promise.all(registryIds.map(id => this.#workers.get(id)?.stop()));
    }

}