import { WebRequestError } from "./WebRequestError";

/**
 * BadRequestError.ts
 * This file defines the BadRequestError class, which is a custom error type that represents a bad request attempt in the DMP Registry system.
 * It extends the built-in Error class and provides a specific error message for bad request attempts.
 */
export class BadRequestError extends WebRequestError {

    readonly code?: string;

    /**
     * Construct a new BadRequestError
     * @param message the message of the error
     * @param code the code of the error
     */
    constructor(message: string, code?: string) {
        super(message, 400);
        this.name = "BadRequestError";
        this.code = code;
    }
}