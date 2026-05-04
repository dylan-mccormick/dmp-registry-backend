import { WebRequestError } from "./WebRequestError";

/**
 * UnauthorizedError.ts
 * This file defines the UnauthorizedError class, which is a custom error type that represents an unauthorized access attempt in the DMP Registry system.
 * It extends the built-in Error class and provides a specific error message for unauthorized access attempts.
 */
export class UnauthorizedError extends WebRequestError {
    /**
     * Construct a new UnauthorizedError
     * @param message the message of the error
     */
    constructor(message: string) {
        super(message, 401);
        this.name = "UnauthorizedError";
    }
}