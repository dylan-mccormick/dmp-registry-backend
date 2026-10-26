import { createHash, getRandomValues } from "crypto";
import { Request, Response, NextFunction } from "express";

export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_";
export const generateSecureAlphanumeric = (length: number): string => {
    const array = new Uint32Array(length);
    getRandomValues(array);

    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars[array[i] % chars.length];
    }
    return result;
}

/**
 * Hashes an agent API key for storage. Keys are 128 random characters, so a fast hash is enough
 * and lets the stored value be looked up directly.
 * @param key the raw agent key
 * @returns the SHA-256 hex digest of the key (64 characters)
 */
export const hashAgentKey = (key: string): string => createHash("sha256").update(key).digest("hex");
