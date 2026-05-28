import { NextFunction, Request, Response, Router } from "express";
import { UserPermissions } from "../model/UserPermissions";
import { RegistryLifecycleService } from "../services/RegistryLifecycleService";
import { AuthedRequest, Authenticator } from "./Authenticator";
import { asyncHandler } from "../Utils";
import { CreateRegistryDetailsSchema } from "./schema/RegistryLifecycleSchema";
import { UsersAuthService } from "../services/UsersAuthService";
import { RegistryActorRoleService } from "../services/RegistryActorRoleService";

export class RegistryRouterAPI {
    readonly #registryLifecycleService: RegistryLifecycleService;
    readonly #registryActorRoleService: RegistryActorRoleService;
    readonly #usersAuthService: UsersAuthService;
    readonly #authenticate: (req: Request, res: Response, next: NextFunction) => void;
    readonly #requiredPermissions: (permissions: UserPermissions[]) => (req: Request, res: Response, next: NextFunction) => void;

    constructor(registryLifecycleService: RegistryLifecycleService, registryActorRoleService: RegistryActorRoleService, usersAuthService: UsersAuthService, authenticator: Authenticator) {
        this.#registryLifecycleService = registryLifecycleService;
        this.#registryActorRoleService = registryActorRoleService;
        this.#usersAuthService = usersAuthService;
        this.#authenticate = authenticator.authenticate.bind(authenticator);
        this.#requiredPermissions = authenticator.requiredPermissions.bind(authenticator);
    }

    public registerRoutes(): Router {
        const router = Router();

        /* REGISTRY LIFECYCLE + ROLES */

        // Get user's registries
        router.get("/list/me", this.#authenticate, asyncHandler(async (req: AuthedRequest, res: Response) => {
            const registries = await this.#registryLifecycleService.getRegistriesForUser(req.user.id);
            res.status(200).json(registries.map(r => (
                {
                    id: r.id,
                    name: r.name,
                    type: r.type,
                    owner: r.createdByUserId,
                    createdAt: r.createdAt
                }
            )));
        }))

        router.post("/new", this.#authenticate, this.#requiredPermissions([ UserPermissions.CREATE_REGISTRY ]), asyncHandler(async (req: AuthedRequest, res: Response) => {
            const { name, type } = CreateRegistryDetailsSchema.parse(req.body);
            if (await this.#registryLifecycleService.getRegistryByName(name)) res.status(400).json({ message: "Registry name is already in use" });
            const result = await this.#registryLifecycleService.createRegistry(name, req.user, type);
            res.status(201).json({ message: "Created registry successfully", id: result.id });
        }))



        return router;
    }
}