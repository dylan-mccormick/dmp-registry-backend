/**
 * RegistryActorRoleServiceImpl.ts
 * This file implements the RegistryActorRoleService interface, providing concrete implementations for managing actors (users + agents)
 * with respect to their roles on specific registries.
 */

import { AxiosInstance } from "axios";
import { RegistryActorRoleService } from "./RegistryActorRoleService";
import { ActorPermissions } from "../model/ActorPermissions";
import { Registry } from "../model/Registry";
import { User } from "../model/User";
import { RegistryAgent } from "../model/RegistryAgent";
import { DatabaseError } from "../error/DatabaseError";
import { AxiosError } from "axios";

export class RegistryActorRoleServiceImpl implements RegistryActorRoleService {

    readonly #dbApi: AxiosInstance;
    readonly #permissionMappingCache: Map<ActorPermissions, number> = new Map();

    constructor(dbApi: AxiosInstance) {
        this.#dbApi = dbApi;
    }

    private async getActorPermissionMapping(permission: ActorPermissions): Promise<number> {
        if (this.#permissionMappingCache.has(permission)) return this.#permissionMappingCache.get(permission)!;
        return this.#dbApi.get(`/registry/permissions?name=${encodeURIComponent(permission)}`).then(res => {
            if (!res.data?.id) throw new DatabaseError("ID field not found in the response to get actor permission mapping.")
            this.#permissionMappingCache.set(permission, res.data.id);
            return res.data.id;
        }).catch(err => {
            console.error("Failed to fetch corresponding ID for permission.", err);
            throw new DatabaseError("Unknown permissions error.");
        })
    }

    public async getUserRoles(registry: Registry, user: User): Promise<ActorPermissions[]> {
        return this.#dbApi.get(`/users/${user.id}/registry/${registry.id}/permissions`).then(res => {
            return [];
        }).catch(err => {
            console.error("Unknown database error.", err);
            throw new DatabaseError("Unknown error.");
        })
    }

    public getAgentRoles(registry: Registry, agent: RegistryAgent): Promise<ActorPermissions[]> {
        return new Promise((res, rej) => res([]));
    }

    public async grantUserRole(registry: Registry, user: User, permission: ActorPermissions): Promise<void> {
        const permissionId = await this.getActorPermissionMapping(permission);
        return this.#dbApi.post(`/users/${user.id}/registry/${registry.id}/permissions/${permissionId}`);
    }

    public async revokeUserRole(registry: Registry, user: User, permission: ActorPermissions): Promise<void> {
        const permissionId = await this.getActorPermissionMapping(permission);
        return this.#dbApi.delete(`/users/${user.id}/registry/${registry.id}/permissions/${permissionId}`);
    }

    public grantAgentRole(registry: Registry, agent: RegistryAgent, permission: ActorPermissions): Promise<void> {
        return new Promise(res => res());
    }

    public revokeAgentRole(registry: Registry, agent: RegistryAgent, permission: ActorPermissions): Promise<void> {
        return new Promise(res => res());
    }

    public async getUsersWithRole(registry: Registry, permission: ActorPermissions): Promise<User[]> {
        const permissionId = await this.getActorPermissionMapping(permission);

        return this.#dbApi.get(`/registry/${registry.id}/permissions/${permissionId}/users`).then(res => {
            return res.data as User[];
        }).catch(err => {
            console.error("Unable to get a list of users with permission on registry.", err);
            throw new DatabaseError("Unknown permissions error.");
        })
    }

    public getAgentsWithRole(registry: Registry, permission: ActorPermissions): Promise<RegistryAgent[]> {
        return new Promise((res, rej) => res([]));
    }

}