import { AxiosInstance } from "axios"
import { UserPermissions } from "./model/UserPermissions";
import { permission } from "node:process";

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

export const verifyRegistryActorPermissionsExist = (dbApi: AxiosInstance): Promise<void> => {
    return new Promise(async (resolve, reject) => {
        resolve(); // handled later
    });
};