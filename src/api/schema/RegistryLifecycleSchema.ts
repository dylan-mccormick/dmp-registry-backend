import z from "zod";
import { RegistryType } from "../../model/RegistryType";
import { ActorPermissions } from "../../model/ActorPermissions";

export const CreateRegistryDetailsSchema = z.object({
    name: z.string().nonempty().max(255).regex(/[a-zA-Z0-9]/),
    type: z.enum(Object.values(RegistryType))
})

export const UpdateRegistryDetailsSchema = z.object({
    name: z.string().nonempty().max(255).regex(/[a-zA-Z0-9]/).optional()
})

export const RegistryIdQuerySchema = z.object({
    registryId: z.coerce.number().int().positive()
})

export const RegistryPermissionNameArrayQuerySchema = z.object({
    permissions: z.array(z.enum(ActorPermissions))
})