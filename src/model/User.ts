/**
 * User.ts
 * This file defines the User class, which represents a user in the system. The User would typically be concerned with
 * their own profile and permissions, as well as specific individual registry permissions.
 */

import { z } from "zod";
import { IllegalArgumentError } from "../error/IllegalArgumentError";
import { Actor } from "./Actor";

const UserFromObjectSchema = z.object({
    id: z.coerce.number().int().positive(),
    username: z.string().min(1).max(255),
    email: z.email(),
    email_verified: z.coerce.boolean(),
    created_at: z.coerce.date(),
    token_version: z.coerce.number().int().nonnegative()
});

export interface UserDictionary {
    id: number;
    username: string;
    email: string;
    emailVerified: boolean;
    createdAt: Date;
    tokenVersion: number;
}

export class User extends Actor {

    readonly #id: number;
    readonly #username: string;
    readonly #email: string;
    readonly #emailVerified: boolean;
    readonly #createdAt: Date;
    readonly #tokenVersion: number = 0;

    /**
     * Constructor for the User class.
     * @param id the user's id
     * @param username the user's username
     * @param email the user's email
     * @param emailVerified whether the user's email has been verified
     * @param permissions the permissions of the user
     * @param createdAt when the user account was created
     * @param tokenVersion the user's token version
     */
    constructor(id: number, username: string, email: string, emailVerified: boolean, createdAt: Date, tokenVersion: number) {
        super();

        this.#id = id;
        this.#username = username;
        this.#email = email;
        this.#emailVerified = emailVerified;
        this.#createdAt = createdAt;
        this.#tokenVersion = tokenVersion;
    }

    public static fromObject(obj: any): User {
        const parsed = UserFromObjectSchema.safeParse(obj);
        if (!parsed.success) {
            throw new IllegalArgumentError(`Invalid user object: ${parsed.error.message}`);
        }

        const { id, username, email, email_verified, created_at, token_version } = parsed.data;
        return new User(id, username, email, email_verified, created_at, token_version);
    }

    /**
     * Gets the user's id.
     * @returns the user's id
     */
    get id(): number {
        return this.#id;
    }

    /**
     * Gets the user's username.
     * @returns the user's username
     */
    get username(): string {
        return this.#username;
    }

    /**
     * Gets the user's email.
     * @returns the user's email
     */
    get email(): string {
        return this.#email;
    }

    /**
     * Gets whether the user's email has been verified.
     * @returns whether the user's email has been verified
     */
    get emailVerified(): boolean {
        return this.#emailVerified;
    }

    /**
     * Gets when the user account was created.
     * @returns when the user account was created
     */
    get createdAt(): Date {
        return this.#createdAt;
    }

    /**
     * Gets the user's token version.
     * @returns the user's token version
     */
    get tokenVersion(): number {
        return this.#tokenVersion;
    }

    /**
     * Converts the User object to a dictionary representation.
     * @returns a dictionary representation of the User
     */
    public toDictionary(): UserDictionary {
        return {
            id: this.#id,
            username: this.#username,
            email: this.#email,
            emailVerified: this.#emailVerified,
            createdAt: this.#createdAt,
            tokenVersion: this.#tokenVersion
        };
    }

    public equals(other: any): boolean {
        if (!(other instanceof User)) {
            return false;
        }

        return this.#id === other.#id &&
            this.#username === other.#username &&
            this.#email === other.#email &&
            this.#emailVerified === other.#emailVerified &&
            this.#createdAt.getTime() === other.#createdAt.getTime() &&
            this.#tokenVersion === other.#tokenVersion;
    }

    public toString(): string {
        return `User(id=${this.#id}, username=${this.#username}, email=${this.#email}, emailVerified=${this.#emailVerified}, createdAt=${this.#createdAt.toISOString()}, tokenVersion=${this.#tokenVersion})`;
    }

}