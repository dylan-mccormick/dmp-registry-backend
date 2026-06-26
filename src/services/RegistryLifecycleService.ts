/**
 * RegistryLifecycleService.ts
 * This file defines the contract for the RegistryLifecycleService class, which is responsible for managing the lifecycle of registries.
 * Not responsible for the actual functionality of registries, but rather CRUD operations.
 */

import { Registry } from "../model/Registry";
import { RegistryType } from "../model/RegistryType";
import { User } from "../model/User";

export interface RegistryLifecycleService {

    /**
     * Creates a new registry with the given parameters, then starts the registry worker.
     * - The name must be unique, non-blank, and less than 255 characters.
     * - The name must not contain spaces or non-alphanumeric characters.
     * - The storage location is derived automatically and should not be provided by the caller.
     * @param name the name for the new registry
     * @param creator the creator of the registry
     * @param type the type of the new registry
     * @return the created registry
     */
    createRegistry(name: string, creator: User, type: RegistryType): Promise<Registry>;

    /**
     * Gets a registry by its id.
     * @param id the id of the registry
     * @return the registry with the given id, or null if no such registry exists
     */
    getRegistryById(id: number): Promise<Registry>;

    /**
     * Gets a registry by its name.
     * @param name the name of the registry
     * @return the registry with the given name, or null if no such registry exists
     */
    getRegistryByName(name: string): Promise<Registry | null>;

    /**
     * Gets a list of all registries in the system.
     * @return a list of all registries in the system
     */
    getRegistries(): Promise<Registry[]>;

    /**
     * Gets a list of registries for which a user has access to.
     * Specifically, this would require that they have a "READ_REGISTRY" permission for the registry.
     * @param userId the id of the user to get registries for
     * @return a list of registries for which the user has access to
     */
    getRegistriesForUser(userId: number): Promise<Registry[]>;

    /**
     * Changes the name of a registry.
     * - The new name must be unique, non-blank, and less than 255 characters.
     * @param registry the registry to change the name of
     * @param newName the new name of the registry
     * @return the updated registry with the new name
     */
    changeRegistryName(registry: Registry, newName: string): Promise<Registry>;

    /**
     * Stops the worker, then deletes the registry from the system.
     * If the registry does not exist, this method should do nothing.
     * @param registryId the id of the registry to delete
     */
    deleteRegistry(registryId: number): Promise<void>;

}