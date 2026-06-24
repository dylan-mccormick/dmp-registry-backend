import { getRandomValues } from "crypto";
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