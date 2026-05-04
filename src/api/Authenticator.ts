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

const JwtPayloadSchema = z.object({
    id: z.number().int().positive(),
    username: z.string().min(1).max(255),
    token_version: z.number().int().nonnegative()
});

export interface AuthedRequest extends Request {
    user?: User;
    userPermissions?: UserPermissions[];
}

export class Authenticator {

    readonly #usersAuthService: UsersAuthService;
    readonly #usersRoleService: UsersRoleService;

    constructor(usersAuthService: UsersAuthService, usersRoleService: UsersRoleService) {
        this.#usersAuthService = usersAuthService;
        this.#usersRoleService = usersRoleService;
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
            return res.status(401).json({ error: "Unauthorized: Invalid token" });
        }

        next();

    };

}