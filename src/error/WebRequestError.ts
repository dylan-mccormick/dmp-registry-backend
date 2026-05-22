/**
 * WebRequestError.ts
 * This file defines the WebRequestError class, which is a custom error type that represents an error that occurs during a web request in the DMP Registry system.
 * It extends the built-in Error class and provides a specific error message for web request errors.
 * This class serves as a base class for more specific web request error types, such as UnauthorizedError, ForbiddenError, and BadRequestError.
 */
export abstract class WebRequestError extends Error {
    #errorStatus: number;

    get errorStatus() {
        return this.#errorStatus;
    }

    /**
     * Construct a new WebRequestError
     * @param message the message of the error
     * @param errorStatus the HTTP status code for the error
     */
    constructor(message: string, errorStatus: number) {
        super(message);
        this.#errorStatus = errorStatus;
        this.name = "WebRequestError";
    }
}