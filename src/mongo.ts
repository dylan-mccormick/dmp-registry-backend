/**
 * mongo.ts
 * Lazily-connected MongoDB client shared by every MongoDB registry worker.
 * MongoDB is optional: when MONGO_URL is unset, MongoDB registries report themselves unavailable.
 */

import { MongoClient } from "mongodb";

let client: Promise<MongoClient> | undefined;

/**
 * Gets the shared client, connecting on first use. A failed connection is retried on the next call.
 * @returns the connected client, or undefined if MONGO_URL is not configured
 */
export const getMongoClient = (): Promise<MongoClient> | undefined => {
    if (!process.env.MONGO_URL) return undefined;

    client ??= MongoClient.connect(process.env.MONGO_URL, { serverSelectionTimeoutMS: 5000 }).catch(err => {
        client = undefined;
        throw err;
    });
    return client;
}
