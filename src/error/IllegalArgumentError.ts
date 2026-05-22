/**
 * Error used to represent when an argument does not meet
 * the preconditions of a method.
 */
export class IllegalArgumentError extends Error {
    /**
     * Construct a new IllegalArgumentError
     * @param message the message of the error
     */
    constructor(message: string) {
        super(message);
        this.name = "IllegalArgumentError";
    }
}