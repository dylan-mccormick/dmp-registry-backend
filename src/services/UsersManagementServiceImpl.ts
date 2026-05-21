/**
 * UsersManagementServiceImpl.ts
 * Implementation of the UsersManagementService interface.
 */

import { AxiosInstance } from "axios";
import bcrypt from "bcrypt";
import { UsersManagementService } from "./UsersManagementService";
import { User } from "../model/User";

interface PatchUserData {
    username?: string;
    email?: string;
    email_verified?: boolean;
    password_hash?: string;
    token_version?: number;
}

export class UsersManagementServiceImpl implements UsersManagementService {

    readonly #dbApi: AxiosInstance;

    /**
     * Creates an instance of UsersManagementServiceImpl.
     * @param dbApi the database Axios Instance to query
     */
    constructor(dbApi: AxiosInstance) {
        this.#dbApi = dbApi;
    }

    private async patchUser(user: User, data: PatchUserData): Promise<User> {
        await this.#dbApi.put(`/users/${user.id}`, data );
        return User.fromObject((await this.#dbApi.get(`/users/${user.id}`)).data);
    }

    public async setUsername(user: User, username: string): Promise<User> {
        return this.patchUser(user, { username });
    }

    public async setEmail(user: User, email: string): Promise<User> {
        return this.patchUser(user, { email, email_verified: false });
    }

    public async setEmailVerified(user: User, emailVerified: boolean): Promise<User> {
        return this.patchUser(user, { email_verified: emailVerified });
    }

    public async setPassword(user: User, password: string): Promise<User> {
        // hash the password before sending it to the database
        const password_hash = await bcrypt.hash(password, 10);
        return this.patchUser(user, { password_hash });
    }

    public async setTokenVersion(user: User, tokenVersion: number): Promise<User> {
        return this.patchUser(user, { token_version: tokenVersion });
    }

}