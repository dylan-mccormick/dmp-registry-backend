/**
 * RegistryActorRoleService.ts
 * This file defines the contract for the RegistryActorRoleService class, which is responsible for managing actor roles for registries.
 * This service is generally responsible for granting and revoking permissions for users on registries, as well as retrieving the permissions that a user has on a registry.
 */

import { ActorPermissions } from "../model/ActorPermissions";
import { Registry } from "../model/Registry";
import { RegistryAgent } from "../model/RegistryAgent";
import { User } from "../model/User";

export interface RegistryActorRoleService {
    getUserRoles(registry: Registry, user: User): Promise<ActorPermissions[]>;

    getAgentRoles(registry: Registry, agent: RegistryAgent): Promise<ActorPermissions[]>;

    grantUserRole(registry: Registry, user: User, permission: ActorPermissions): Promise<void>;

    revokeUserRole(registry: Registry, user: User, permission: ActorPermissions): Promise<void>;

    grantAgentRole(registry: Registry, agent: RegistryAgent, permission: ActorPermissions): Promise<void>;

    revokeAgentRole(registry: Registry, agent: RegistryAgent, permission: ActorPermissions): Promise<void>;

    getUsersWithRole(registry: Registry, permission: ActorPermissions): Promise<User[]>;

    getAgentsWithRole(registry: Registry, permission: ActorPermissions): Promise<RegistryAgent[]>;
}