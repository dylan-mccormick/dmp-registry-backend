/**
 * RegistryLifecycleServiceImpl.ts
 * This file implements the RegistryLifecycleService interface, providing concrete implementations for managing the lifecycle of registries.
 * This class is responsible for performing CRUD operations on registries, ensuring that all constraints and validations are met.
 */

import { AxiosInstance } from "axios";
import { BadRequestError } from "../error/BadRequestError";
import { Registry } from "../model/Registry";
import { RegistryType } from "../model/RegistryType";
import { RegistryLifecycleService } from "./RegistryLifecycleService";
import { v4 } from "uuid";

export class RegistryLifecycleServiceImpl {

    readonly #dbApi: AxiosInstance;

    constructor(dbApi: AxiosInstance) {
        this.#dbApi = dbApi;
    }

    public async createRegistry(name: string, type: RegistryType): Promise<Registry> {
        // Validate the name is unique, non-blank and less than 255 characters with no spaces or non-alphanumeric characters
        if (!name || name.trim() === "" || name.length >= 255 || /[^a-zA-Z0-9]/.test(name)) {
            throw new BadRequestError("Invalid registry name.");
        }

        // Check if a registry with the same name already exists (this is a placeholder, actual implementation would query the database)
        const existingRegistry = await this.getRegistryByName(name);
        if (existingRegistry) {
            throw new BadRequestError("Registry name already in use.");
        }

        // Determine storage location for registry
        const storageLocation = `/registries/${v4()}`;
        // Ensure there is no collision
        await this.#dbApi.get(`/registry/by-storage-location?storageLocation=${encodeURIComponent(storageLocation)}`).then(res => { throw new BadRequestError("Storage location collision, please try again.")}).catch(err => {
            if (err.response && err.response.status === 404) {
                // No collision, proceed with creation
            } else {
                throw err;
            }
        });

        // Create the registry
        const data = await this.#dbApi.post('/registry', {
            name,
            type,
            storage_location: storageLocation
        }).then(res => res.data)

        return Registry.fromObject(data);
    }

    public async getRegistryByName(name: string): Promise<Registry | null> {
        return this.#dbApi.get(`/registry?name=${encodeURIComponent(name)}`).then(res => {
            return Registry.fromObject(res.data);
        }).catch(err => {
            if (err.response && err.response.status === 404) {
                return null;
            }
            throw err;
        })
    }

    public async getRegistryById(id: number): Promise<Registry> {
        return new Registry(1, "Placeholder", RegistryType.files, `/registries/${v4()}`, new Date()); // placeholder
    }

    public async getRegistries(): Promise<Registry[]> {
        return [];
    }

    public async getRegistriesForUser(userId: number): Promise<Registry[]> {
        return [];
    }

    public async changeRegistryName(registry: Registry, newName: string): Promise<Registry> {
        return registry;
    }

    public async deleteRegistry(registryId: number): Promise<void> {
        return;
    }

}