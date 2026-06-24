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
    /**
     * Gets the ActorPermission by the given role ID.
     * @param roleId the id of the role to get
     */
    getActorRoleById(roleId: number): Promise<ActorPermissions>

    /**
     * Gets the corresponding ID for a specific Actor Permission, which is required for granting and revoking permissions for users and agents
     * @param permission the permission to get the ID of
     */
    getActorPermissionMapping(permission: ActorPermissions): Promise<number>;

    /**
     * Gets a list of Actor Permissions that a specific user has on a specific registry
     * @param registry the registry to check user roles for
     * @param user the user to check the roles of
     * @returns a list of Actor Permissions describing what this actor can do to the registry
     */
    getUserRoles(registry: Registry, user: User): Promise<ActorPermissions[]>;

    /**
     * Gets a list of Actor permissions that a specific actor has on a specific registry
     * @param registry the registry to check agent roles for
     * @param agent the agent to check the roles of
     * @returns a list of Actor Permissions describing what this actor can do to the registry
     */
    getAgentRoles(registry: Registry, agent: RegistryAgent): Promise<ActorPermissions[]>;

    /**
     * Grants a specific user an Actor Permission on a specific registry
     * - If the user already has the role, nothing will happen
     * @param registry the registry to grant the user a role to
     * @param user the user to grant the role to
     * @param permission the role to grant
     */
    grantUserRole(registry: Registry, user: User, permission: ActorPermissions): Promise<void>;

    /**
     * Revokes a role from a user on a specific registry
     * - If the user does not have the role, nothing will happen
     * @param registry the registry to revoke the user role from
     * @param user the user to revoke the role from
     * @param permission the role to revoke
     */
    revokeUserRole(registry: Registry, user: User, permission: ActorPermissions): Promise<void>;

    /**
     * Grants a specific agent an Actor Permission on a specific registry
     * - If the agent already has the role, nothing will happen
     * @param registry the registry to grant the agent a role to
     * @param agent the agent to grant the role to
     * @param permission the role to grant
     */
    grantAgentRole(registry: Registry, agent: RegistryAgent, permission: ActorPermissions): Promise<void>;

    /**
     * Revokes a specific agent an Actor Permission on a specific registry
     * - If the agent already has the role, nothing will happen
     * @param registry the registry to revoke the agent's role from
     * @param agent the agent to revoke the role from
     * @param permission the role to revoke
     */
    revokeAgentRole(registry: Registry, agent: RegistryAgent, permission: ActorPermissions): Promise<void>;

    /**
     * Gets a list of users, on a specific registry, that have a specific role
     * @param registry the registry to check
     * @param permission the permission to check
     * @returns users of the registry with such role
     */
    getUsersWithRole(registry: Registry, permission: ActorPermissions): Promise<User[]>;

}