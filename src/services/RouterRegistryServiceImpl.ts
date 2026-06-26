/**
 * RouterRegistryServiceImpl.ts
 * Contains an implementation of the RouterRegistryService interface contract.
 */

import { Application, Router } from "express";
import { RouterRegistryService } from "./RouterRegistryService";
import { IllegalStateError } from "../error/IllegalStateError";
import errorHandler from "../api/errorHandler";

export class RouterRegistryServiceImpl implements RouterRegistryService {

    readonly #api: Application;
    readonly #blankRouter: Router;
    readonly #routes: Map<string, Router>;

    constructor(api: Application) {
        this.#api = api;
        this.#routes = new Map<string, Router>();
        this.#blankRouter = Router();
    }

    public assign(route: string, router: Router): void {
        // if route not in use, we need to also establish routing functionality
        if (!this.#routes.get(route)) {
            this.#api.use(route, (req, res, next) => {
                const router = this.#routes.get(route);

                if (!router) return next();
                router(req, res, next);
            });
        }

        // check if in use
        if (this.#routes.get(route) && this.#routes.get(route) !== this.#blankRouter) throw new IllegalStateError(`Attempt to establish route ${route} while already in use`);

        // create the route
        router.use(errorHandler);
        this.#routes.set(route, router);
    }

    public unassign(route: string): void {
        // idempotent unassign
        if (!this.#routes.get(route)) return;
        this.#routes.set(route, this.#blankRouter);
    }

}