import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { WebRequestError } from "../error/WebRequestError";

const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
    // ZodErrors: Bad Request
    if (err instanceof ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: err.flatten() });
    }

    console.warn("A handled error has occured in the API handler:", err);

    // UnauthorizedError: Just return the error message without exposing internal details
    if (err instanceof WebRequestError) {
        return res.status(err.errorStatus).json({ error: err.message });
    }

    // Log the error
    console.error("An error has occured in the API handler:", err);

    // Send a generic error response. Expose specific error details only in development mode.
    if (process.env.NODE_ENV === "development") {
        return res.status(500).json({ error: err.message, stack: err.stack });
    }
    return res.status(500).json({ error: "An internal server error occurred" });
};

export default errorHandler;