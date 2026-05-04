/**
 * Error used to represent when an operation is impossible at the
 * current state.
 */
export class IllegalStateError extends Error {
    /**
     * Construct a new IllegalStateError
     * @param message the message of the error
     */
    constructor(message: string) {
        super(message);
        this.name = "IllegalStateError";
    }
}