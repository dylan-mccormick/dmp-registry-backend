import { AxiosInstance } from "axios"
import { UserPermissions } from "./model/UserPermissions";
import { ActorPermissions } from "./model/ActorPermissions";

export const verifyUserPermissionsExist = async (dbApi: AxiosInstance): Promise<void> => {
    const response = await dbApi.get("/users/permissions");
    const existing: { name: string, id: number }[] = response.data;

    const missing = Object.values(UserPermissions).filter(
        permission => !existing.some(p => p.name === permission)
    );

    await Promise.all(missing.map(permission =>
        dbApi.post("/users/permissions", { name: permission })
            .then(() => console.log(`Permission ${permission} created successfully`))
    ));
};

export const verifyRegistryActorPermissionsExist = async (dbApi: AxiosInstance): Promise<void> => {
    const response = await dbApi.get("/registry/permissions");
    const existing: { name: string, rpid: number }[] = response.data;

    const missing = Object.values(ActorPermissions).filter(
        permission => !existing.some(p => p.name === permission)
    );

    await Promise.all(missing.map(permission =>
        dbApi.post("/registry/permissions", { name: permission })
            .then(() => console.log(`Permission ${permission} created successfully`))
    ));
};