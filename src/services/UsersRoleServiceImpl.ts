/**
 * UsersRoleServiceImpl.ts
 * Implementation of the UsersRoleService interface.
 */

import { AxiosInstance } from "axios";
import { UserPermissions } from "../model/UserPermissions";
import { UsersRoleService } from "./UsersRoleService";

export class UsersRoleServiceImpl implements UsersRoleService {

    readonly #dbApi: AxiosInstance;

    private readonly mapPermissionToEnum = (perm: Object) => {
        if (!("name" in perm)) {
            throw new Error("Permission object missing 'name' property");
        }

        if (typeof perm.name === "string" && perm.name in UserPermissions) {
            return UserPermissions[perm.name as keyof typeof UserPermissions];
        } // if the name isn't recognized, skip it
    }

    private readonly getIdFromPermission = async (permission: UserPermissions): Promise<number> => {
        const objectFromName = await this.#dbApi.get("/users/permissions?name=" + encodeURIComponent(permission));
        if (objectFromName.status !== 200 || objectFromName.data.length === 0) {
            throw new Error(`Permission ${permission} not found`);
        }
        return objectFromName.data[0].id;
    };

    /**
     * Creates an instance of UsersRoleServiceImpl.
     * @param dbApi the database Axios Instance to query
     */
    constructor(dbApi: AxiosInstance) {
        this.#dbApi = dbApi;
    }

    public async getPermissions(): Promise<UserPermissions[]> {
        const response = await this.#dbApi.get("/users/permissions");
        const permissions: UserPermissions[] = response.data.map(this.mapPermissionToEnum);
        return permissions;
    }

    public async getPermissionsOnUser(user: any): Promise<UserPermissions[]> {
        const response = await this.#dbApi.get(`/users/${user.id}/permissions`);
        const permissions: UserPermissions[] = response.data.map(this.mapPermissionToEnum);
        return permissions;
    }

    public async assignPermissionToUser(user: any, permission: UserPermissions): Promise<void> {
        const permissionId = await this.getIdFromPermission(permission);
        await this.#dbApi.post(`/users/${user.id}/permissions`, { permission_id: permissionId });
        return;
    }

    public async removePermissionFromUser(user: any, permission: UserPermissions): Promise<void> {
        const permissionId = await this.getIdFromPermission(permission);
        await this.#dbApi.delete(`/users/${user.id}/permissions/${permissionId}`);
        return;
    }

}