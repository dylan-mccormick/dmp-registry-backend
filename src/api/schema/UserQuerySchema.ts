import { z } from "zod";
import { UserPermissions } from "../../model/UserPermissions";

export const UserIdQuerySchema = z.object({
    userId: z.coerce.number().int().positive()
});

export const UserCreateQuerySchema = z.object({
    username: z.string().min(1).max(255).regex(/^\w+$/, { message: "Username must be alphanumeric and can include underscores" }),
    email: z.email(),
    password: z.string().min(8).max(255).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, { message: "Password must be 8+ characters and include at least one uppercase letter, one lowercase letter, one number, and one special character" })
});

export const UserPasswordOnlyQuerySchema = z.object({
    password: z.string().min(8).max(255)
});

export const UserPasswordUpdateQuerySchema = z.object({
    oldPassword: z.string().min(8).max(255),
    newPassword: z.string().min(8).max(255).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, { message: "Password must be 8+ characters and include at least one uppercase letter, one lowercase letter, one number, and one special character" })
});

export const UserIdPermissionQuerySchema = z.object({
    userId: z.coerce.number().int().positive(),
    permission: z.enum(Object.values(UserPermissions))
});

export const UserAdminUpdateQuerySchema = z.object({
    username: z.string().min(1).max(255).optional(),
    email: z.email().optional(),
    email_verified: z.boolean().optional()
});

export const UserPersonalUpdateQuerySchema = z.object({
    username: z.string().min(1).max(255).optional(),
    email: z.email().optional(),
    password: z.string().min(8).max(255).optional()
});