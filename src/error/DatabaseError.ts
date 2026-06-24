/**
 * DatabaseError.ts
 * This file defines the DatabaseError class, which is a custom error type that represents an error that occurs when interacting with the database in the DMP Registry system.
 * It extends the built-in Error class and provides a specific error message for database-related errors.
 */
export class DatabaseError extends Error {
    /**
     * Construct a new DatabaseError
     * @param message the message of the error
     * @param cause the optional cause of the error
     */
    constructor(message: string, cause?: unknown) {
        super(message, { cause });
        this.name = "DatabaseError";
    }
}