/**
 * RouterRegistryService.ts
 * Contains an interface contract for the RouterRegistryService, which is a service responsible for
 * managing the lifecycle of routes that are implemented by registry workers.
 */

import { Router } from "express";
import { IllegalStateError } from "../error/IllegalStateError";

export interface RouterRegistryService {

    /**
     * Assigns a router to be used by a route. The route must not currently be handled by a router
     * @param route the route to assign the router to
     * @param router the router to use
     * @throws { IllegalStateError } if the route is already being handled
     */
    assign(route: string, router: Router): void;

    /**
     * Unassigns a router from a specific route.
     * If the route is not in use, nothing will happen.
     * @param route the route to unassign
     */
    unassign(route: string): void;

}