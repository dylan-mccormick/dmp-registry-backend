import axios, { AxiosInstance } from "axios";

/**
 * initDB.ts
 * This file initializes the connection to the database using the provided API key and base URL. It creates an instance of Axios with the appropriate headers for authentication.
 */
export const initDB = (apiKey: string, baseUrl: string): Promise<AxiosInstance> => new Promise((resolve) => {
    resolve(axios.create({
        baseURL: baseUrl,
        headers: {
            'x-api-key': apiKey
        }
    }));
});