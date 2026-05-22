/**
 * UsersRoleService.ts
 * This file defines the contract for the UsersRoleService class, which is responsible for managing user permissions in the DMP Registry system.
 * It interacts with the database to retrieve and update user permissions, as well as manage user roles.
 */
import { User } from "../model/User";
import { UserPermissions } from "../model/UserPermissions";

export interface UsersRoleService {

    /**
     * Retrieves a list of all available permissions in the system.
     * @returns A promise that resolves to an array of UserPermissions objects.
     */
    getPermissions(): Promise<UserPermissions[]>;

    /**
     * Gets a list of permissions assigned to a user.
     * @param user the user to check the permissions of
     * @returns A promise that resolves to an array of UserPermissions objects.
     */
    getPermissionsOnUser(user: User): Promise<UserPermissions[]>;

    /**
     * Assigns a permission to a user.
     * @param user the user to assign the permission to
     * @param permission the permission to assign
     */
    assignPermissionToUser(user: User, permission: UserPermissions): Promise<void>;

    /**
     * Removes a permission from a user.
     * @param user the user to remove the permission from
     * @param permission the permission to remove
     */
    removePermissionFromUser(user: User, permission: UserPermissions): Promise<void>;

}