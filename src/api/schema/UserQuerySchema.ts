import { z } from "zod";
import { UserPermissions } from "../../model/UserPermissions";

export const UserIdQuerySchema = z.object({
    userId: z.coerce.number().int().positive()
});

export const UserIdPermissionQuerySchema = z.object({
    userId: z.coerce.number().int().positive(),
    permission: z.enum(Object.values(UserPermissions))
});