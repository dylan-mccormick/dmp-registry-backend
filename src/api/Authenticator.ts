/**
 * Authenticator.ts
 * This file defines the Authenticator class, which is responsible for handling authentication-related
 * operations for the API. This includes verifying user credentials, generating and validating JSON Web Tokens (JWTs), and managing token revocation.
 */

import { Request, Response, NextFunction } from "express";
import { UsersAuthService } from "../services/UsersAuthService";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { UserPermissions } from "../model/UserPermissions";
import { User } from "../model/User";
import { UsersRoleService } from "../services/UsersRoleService";
import { ActorPermissions } from "../model/ActorPermissions";
import { RegistryActorRoleService } from "../services/RegistryActorRoleService";
import { RegistryLifecycleService } from "../services/RegistryLifecycleService";
import { RegistryIdQuerySchema } from "./schema/RegistryLifecycleSchema";
import { Registry } from "../model/Registry";
import { IllegalArgumentError } from "../error/IllegalArgumentError";

const JwtPayloadSchema = z.object({
    id: z.number().int().positive(),
    username: z.string().min(1).max(255),
    token_version: z.number().int().nonnegative()
});

export interface AuthedRequest extends Request {
    user: User;
    userPermissions: UserPermissions[];
}

export interface AuthedRegistryRequest extends AuthedRequest {
    registry: Registry;
    actorPermissions: ActorPermissions[];
}

export class Authenticator {

    readonly #usersAuthService: UsersAuthService;
    readonly #usersRoleService: UsersRoleService;
    readonly #registryLifecycleService: RegistryLifecycleService;
    readonly #registryActorRoleService: RegistryActorRoleService;

    constructor(usersAuthService: UsersAuthService, usersRoleService: UsersRoleService, registryLifecycleService: RegistryLifecycleService, registryActorRoleService: RegistryActorRoleService) {
        this.#usersAuthService = usersAuthService;
        this.#usersRoleService = usersRoleService;
        this.#registryActorRoleService = registryActorRoleService;
        this.#registryLifecycleService = registryLifecycleService;
    }

    /**
     * Verifies a JSON Web Token (JWT) and returns the corresponding user if the token is valid.
     * @param token the JWT to verify
     * @returns A promise that resolves to the User object corresponding to the token, or null if the token is invalid.
     */
    public async authenticate(req: Request, res: Response, next: NextFunction) {

        const token = req.cookies?.["token"];
        if (!token) {
            return res.status(401).json({ error: "Unauthorized: No token provided" });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;
            const parsed = JwtPayloadSchema.safeParse(decoded);
            if (!parsed.success) {
                return res.status(401).json({ error: "Unauthorized: Invalid token payload" });
            }

            const user = await this.#usersAuthService.getUserById(parsed.data.id);

            if (!user || user.tokenVersion !== parsed.data.token_version) {
                return res.status(401).json({ error: "Unauthorized: Invalid token" });
            }

            // Attach the user to the request object for use in subsequent middleware and route handlers
            const permissions = await this.#usersRoleService.getPermissionsOnUser(user);
            (req as AuthedRequest).userPermissions = permissions;
            (req as AuthedRequest).user = user;
        } catch (err) {
            console.error("Error verifying token:", err);
            return res.status(401).json({ error: "Unauthorized: Invalid token" });
        }

        next();

    };

    public requiredPermissions(permissions: UserPermissions[]): (req: Request, res: Response, next: NextFunction) => void {
        return (req: Request, res: Response, next: NextFunction) => {
            const authedReq = req as AuthedRequest;
            if (!authedReq.user) {
                return res.status(401).json({ error: "Unauthorized: No user authenticated" });
            }

            const userPermissions = authedReq.userPermissions || [];
            const hasRequiredPermissions = permissions.every(permission => userPermissions.includes(permission));

            if (!hasRequiredPermissions) {
                return res.status(403).json({ error: "Forbidden: Insufficient permissions" });
            }

            next();
        }
    }

    public requiredRegistryPermissions(permissions: ActorPermissions[]): (req: Request, res: Response, next: NextFunction) => void;

    public requiredRegistryPermissions(registryId: number, permissions: ActorPermissions[]): (req: Request, res: Response, next: NextFunction) => void;

    public requiredRegistryPermissions(arg0: number | ActorPermissions[], arg1?: ActorPermissions[]): (req: Request, res: Response, next: NextFunction) => void {
        return async (req: Request, res: Response, next: NextFunction) => {
            // handle method overloading
            let registryId: number;
            let permissions: ActorPermissions[];
            if (typeof arg0 == "number" && arg1 && typeof arg1 == "object") {
                registryId = arg0 as number;
                permissions = arg1;
            } else if (typeof arg0 == "object" && !arg1) {
                registryId = RegistryIdQuerySchema.parse(req.params).registryId;
                permissions = arg0;
            } else {
                throw new IllegalArgumentError(`No method overload matches the provided signature. (${typeof arg0}, ${typeof arg1})`);
            }

            // Actual handler
            const authedReq = req as AuthedRequest;
            if (!authedReq.user) {
                return res.status(401).json({ error: "Unauthorized: No user authenticated" });
            }

            // fetch registry
            const registry = await this.#registryLifecycleService.getRegistryById(registryId);
            if (!registry) return res.status(404).json({ error: "Registry not found" });

            // fetch actor permissions
            const actorPermissions = await this.#registryActorRoleService.getUserRoles(registry, authedReq.user);

            // assign details
            (authedReq as AuthedRegistryRequest).registry = registry;
            (authedReq as AuthedRegistryRequest).actorPermissions = actorPermissions;

            // verify has permissions
            if (!permissions.every(p => actorPermissions.includes(p))) {
                return res.status(403).json({ error: "Forbidden: Insufficient registry permissions" });
            }

            next();
        }
    }

}