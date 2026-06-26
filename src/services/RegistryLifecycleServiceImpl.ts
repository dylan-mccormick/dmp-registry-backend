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
import { AxiosError } from "axios";
import { WebRequestError } from "../error/WebRequestError";
import { DatabaseError } from "../error/DatabaseError";
import { RegistryActorRoleService } from "./RegistryActorRoleService";
import { User } from "../model/User";
import { ActorPermissions } from "../model/ActorPermissions";
import { RegistryWorkerService } from "./RegistryWorkerService";
import { IllegalStateError } from "../error/IllegalStateError";

export class RegistryLifecycleServiceImpl implements RegistryLifecycleService {

    readonly #dbApi: AxiosInstance;
    readonly #registryActorRoleService: RegistryActorRoleService;
    #registryWorkerService: RegistryWorkerService | undefined;

    constructor(dbApi: AxiosInstance, registryActorRoleService: RegistryActorRoleService) {
        this.#dbApi = dbApi;
        this.#registryActorRoleService = registryActorRoleService;
    }

    public async createRegistry(name: string, creator: User, type: RegistryType): Promise<Registry> {
        if (!this.#registryWorkerService) throw new IllegalStateError(`Application has not yet fully initialized.`);

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
                console.error("Unknown database API error. ", err);
                throw new DatabaseError("Unknown error.");
            }
        });

        // Create the registry
        const data = await this.#dbApi.post('/registry', {
            name,
            type,
            storage_location: storageLocation,
            created_by_user_id: creator.id
        }).then(res => res.data)
        const registry = Registry.fromObject(data);

        // give the user all actor permissions
        await this.#registryActorRoleService.grantUserRole(registry, creator, ActorPermissions.MANAGE_USERS);
        await this.#registryActorRoleService.grantUserRole(registry, creator, ActorPermissions.READ_AGENTS);
        await this.#registryActorRoleService.grantUserRole(registry, creator, ActorPermissions.WRITE_AGENTS);
        await this.#registryActorRoleService.grantUserRole(registry, creator, ActorPermissions.READ_REGISTRY);
        await this.#registryActorRoleService.grantUserRole(registry, creator, ActorPermissions.WRITE_REGISTRY);

        // start the worker
        await this.#registryWorkerService.startWorker(registry);

        return registry;
    }

    public async getRegistryByName(name: string): Promise<Registry | null> {
        return this.#dbApi.get(`/registry?name=${encodeURIComponent(name)}`).then(res => {
            return Registry.fromObject(res.data);
        }).catch(err => {
            if (err.response && err.response.status === 404) {
                return null;
            }
            console.error("Unknown database API error. ", err);
            throw new DatabaseError("Unknown error.");
        })
    }

    public async getRegistryById(id: number): Promise<Registry> {
        return this.#dbApi.get(`/registry/${id}`).then(res => {
            return Registry.fromObject(res.data);
        }).catch(err => {
            if (err.response && err.response.status === 404) {
                throw new BadRequestError("Registry not found.");
            }
            console.error("Unknown database API error. ", err);
            throw new DatabaseError("Unknown error.");
        })
    }

    public async getRegistries(): Promise<Registry[]> {
        return this.#dbApi.get('/registry').then(res => {
            return res.data.map((registryData: any) => Registry.fromObject(registryData));
        });
    }

    public async getRegistriesForUser(userId: number): Promise<Registry[]> {
        return this.#dbApi.get(`/registry?userId=${userId}&permissionId=${await this.#registryActorRoleService.getActorPermissionMapping(ActorPermissions.READ_REGISTRY)}`).then(res => {
            return res.data.map((registryData: any) => Registry.fromObject(registryData));
        });
    }

    public async changeRegistryName(registry: Registry, newName: string): Promise<Registry> {
        // Validate the name is unique, non-blank and less than 255 characters with no spaces or non-alphanumeric characters
        if (!newName || newName.trim() === "" || newName.length >= 255 || /[^a-zA-Z0-9]/.test(newName)) {
            throw new BadRequestError("Invalid registry name.");
        }

        return this.#dbApi.put(`/registry/${registry.id}`, { name: newName }).then(async () => {
            return Registry.fromObject(await this.getRegistryById(registry.id));
        }).catch(err => {
            if (err instanceof AxiosError && err.response?.data?.code) {
                if (err.response.data.code == "REGISTRY_NOT_FOUND") {
                    throw new BadRequestError("Registry not found.");
                } else if (err.response.data.code == "REGISTRY_ALREADY_EXISTS") {
                    throw new BadRequestError("A registry with this name already exists.");
                }
            }
            console.error("Unknown database API error. ", err);
            throw new DatabaseError("Unknown error.");
        })
    }

    public async deleteRegistry(registryId: number): Promise<void> {
        if (!this.#registryWorkerService) throw new IllegalStateError(`Application has not yet fully initialized.`);
        const registry = await this.getRegistryById(registryId);
        if (!registry) return;

        await this.#registryWorkerService.stopWorker(registryId);
        await this.#registryWorkerService.destroyRegistry(registry.storageLocation);

        // Idempotent delete
        this.#dbApi.delete(`/registry/${registryId}`).catch(err => {
            console.error("Unknown database API error. ", err);
            throw new DatabaseError("Unknown error.");
        });
    }

    public setWorkerService(registryWorkerService: RegistryWorkerService) {
        this.#registryWorkerService = registryWorkerService;
    }

}