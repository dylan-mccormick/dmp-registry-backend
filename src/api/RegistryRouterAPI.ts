import { NextFunction, Request, Response, Router } from "express";
import { UserPermissions } from "../model/UserPermissions";
import { RegistryLifecycleService } from "../services/RegistryLifecycleService";
import { Authenticator } from "./Authenticator";

export class RegistryRouterAPI {
    readonly #registryLifecycleService: RegistryLifecycleService;
    readonly #authenticate: (req: Request, res: Response, next: NextFunction) => void;
    readonly #requiredPermissions: (permissions: UserPermissions[]) => (req: Request, res: Response, next: NextFunction) => void;

    constructor(registryLifecycleService: RegistryLifecycleService, authenticator: Authenticator) {
        this.#registryLifecycleService = registryLifecycleService;
        this.#authenticate = authenticator.authenticate.bind(authenticator);
        this.#requiredPermissions = authenticator.requiredPermissions.bind(authenticator);
    }

    public registerRoutes(): Router {
        const router = Router();



        return router;
    }
}