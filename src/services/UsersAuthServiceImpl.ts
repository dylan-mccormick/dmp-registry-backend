/**
 * UsersAuthServiceImpl.ts
 * Implementation of the UsersAuthService interface.
 */

import axios, { AxiosInstance } from "axios";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { UsersAuthService } from "./UsersAuthService";
import { User } from "../model/User";
import { UnauthorizedError } from "../error/UnauthorizedError";
import { BadRequestError } from "../error/BadRequestError";
import { ForbiddenError } from "../error/ForbiddenError";
import { UsersManagementService } from "./UsersManagementService";

export class UsersAuthServiceImpl implements UsersAuthService {

    readonly #dbApi: AxiosInstance;
    readonly #usersManagementService: UsersManagementService;

    /**
     * Creates an instance of UsersAuthServiceImpl.
     * @param dbApi the database Axios Instance to query
     * @param usersManagementService the users management service
     */
    constructor(dbApi: AxiosInstance, usersManagementService: UsersManagementService) {
        this.#dbApi = dbApi;
        this.#usersManagementService = usersManagementService;
    }

    private async generateJwt(user: User): Promise<string> {
        const payload = {
            id: user.id,
            username: user.username,
            token_version: user.tokenVersion
        };

        return jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: "2d" });
    }

    public async getUsers(): Promise<User[]> {
        const response = await this.#dbApi.get("/users");
        return response.data.map((userObj: any) => User.fromObject(userObj));
    }

    public async getUserById(id: number): Promise<User> {
        const response = await this.#dbApi.get(`/users/${id}`);
        return User.fromObject(response.data);
    }

    public async deleteUser(user: User): Promise<void> {
        await this.#dbApi.delete(`/users/${user.id}`);
        return;
    }

    public async searchUser(query: string): Promise<User[]> {
        const response = await this.#dbApi.get(`/users?search=${encodeURIComponent(query)}`);
        return response.data.map((userObj: any) => User.fromObject(userObj));
    }

    public async registerUser(username: string, email: string, password: string): Promise<string> {
        const password_hash = await bcrypt.hash(password, 10);
        try {
            const response = await this.#dbApi.post("/users", { username, email, password_hash });
            return await this.generateJwt(User.fromObject(response.data));
        } catch (error: any) {
            if (axios.isAxiosError(error) && error.response?.data?.code == "USERNAME_ALREADY_IN_USE") {
                throw new BadRequestError("Username already in use", "USERNAME_ALREADY_IN_USE");
            }
            throw error;
        }
    }

    public async verifyPassword(user: User, password: string): Promise<boolean> {
        const userRawDetails = await this.#dbApi.get(`/users/${user.id}`);
        const passwordHash = userRawDetails.data.password_hash;
        return await bcrypt.compare(password, passwordHash);
    }

    public async loginUser(username: string, password: string): Promise<string> {
        const targetUser = await this.#dbApi.get(`/users?username=${encodeURIComponent(username)}`);
        if (targetUser.status !== 200 || targetUser.data.length === 0) {
            throw new UnauthorizedError("Invalid username or password");
        }

        const userObj = targetUser.data;
        const passwordHash = userObj.password_hash;
        const passwordMatch = await bcrypt.compare(password, passwordHash);
        if (!passwordMatch) {
            throw new ForbiddenError("Invalid username or password");
        }

        return await this.generateJwt(User.fromObject(userObj));
    }

    public async logoutUser(user: User): Promise<void> {
        // increment token version to invalidate existing tokens
        await this.#usersManagementService.setTokenVersion(user, user.tokenVersion + 1);
        return;
    }

}