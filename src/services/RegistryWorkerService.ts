/**
 * RegistryWorkerService.ts
 * Contains the interface contract for the RegistryWorkerService, which is designed to manage
 * the lifecycle of registry workers.
 */

import { Registry } from "../model/Registry";
import { RegistryWorker } from "../model/workers/RegistryWorker";
import { IllegalStateError } from "../error/IllegalStateError";
import { AuthedRegistryRequest } from "../api/Authenticator";
import { Response } from "express";

export interface RegistryWorkerService {

    /**
     * Gets a list of registry IDs that currently have an assigned worker.
     * @returns an array of registry IDs
     */
    getActiveRegistryIds(): number[];

    /**
     * Gets the currently running registry worker for a specific registry
     * @param registryId the ID of the target registry
     * @returns the registry worker or undefined if the registry worker does not exist
     */
    getWorkerForRegistry(registryId: number): RegistryWorker | undefined;

    /**
     * Starts the appropriate registry worker for the specified registry, and registers the
     * appropriate routes
     * @param registry the registry to start the worker for
     * @returns a promise that resolves if the worker successfully starts
     * @throws { IllegalStateError } if the registry already has a worker
     */
    startWorker(registry: Registry): Promise<void>;

    /**
     * Stops the registry worker, if any, for the specified registry
     * If the registry does not have a worker, nothing will happen
     * @param registryId the ID of the registry to stop the worker for
     * @returns a promise that resolves to true if the registry had a worker, or false if the registry did not have a worker
     */
    stopWorker(registryId: number): Promise<boolean>;

    /**
     * Bulk starts registry workers for the specified list of registries
     * If any worker fails, all spawned registry workers will be stopped
     * If any registry already has a worker, nothing will happen
     * @param registries a list of registries to start workers for
     * @returns a promise that resolves to true if all workers have started
     */
    bulkStartWorkers(registries: Registry[]): Promise<void>;

    /**
     * Bulk stops registry workers by the provided IDs
     * If the registry does not have a worker, nothing will happen
     * @param registries the IDs of the registries to stop
     * @returns a promise that resolves when all registry workers have stopped
     */
    bulkStopWorkers(registryIds: number[]): Promise<void>;

}