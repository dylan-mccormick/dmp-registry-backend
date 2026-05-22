import { WebRequestError } from "./WebRequestError";

/**
 * ForbiddenError.ts
 * This file defines the ForbiddenError class, which is a custom error type that represents a forbidden access attempt in the DMP Registry system.
 * It extends the built-in Error class and provides a specific error message for forbidden access attempts.
 */
export class ForbiddenError extends WebRequestError {
    /**
     * Construct a new ForbiddenError
     * @param message the message of the error
     */
    constructor(message: string) {
        super(message, 403);
        this.name = "ForbiddenError";
    }
}