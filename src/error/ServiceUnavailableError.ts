/**
 * ServiceUnavailableError.ts
 * Thrown when a dependency the request needs (e.g. an external database) is not available.
 */
import { WebRequestError } from "./WebRequestError";

export class ServiceUnavailableError extends WebRequestError {
    constructor(message: string) {
        super(message, 503);
        this.name = "ServiceUnavailableError";
    }
}
