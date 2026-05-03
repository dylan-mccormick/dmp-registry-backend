/**
 * User.ts
 * This file defines the User class, which represents a user in the system. The User would typically be concerned with
 * their own profile and permissions, as well as specific individual registry permissions.
 */

import { Actor } from "./Actor";
import { UserPermissions } from "./UserPermissions";

export class User extends Actor {

    readonly #username: string;
    readonly #email: string;
    readonly #emailVerified: boolean;
    readonly #permissions: UserPermissions[];
    readonly #createdAt: Date;

    /**
     * Constructor for the User class.
     * @param username the user's username
     * @param email the user's email
     * @param emailVerified whether the user's email has been verified
     * @param permissions the permissions of the user
     * @param createdAt when the user account was created
     */
    constructor(username: string, email: string, emailVerified: boolean, permissions: UserPermissions[], createdAt: Date) {
        super();

        this.#username = username;
        this.#email = email;
        this.#emailVerified = emailVerified;
        this.#permissions = permissions;
        this.#createdAt = createdAt;
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
     * Gets the user's permissions.
     * @returns the user's permissions
     */
    get permissions(): UserPermissions[] {
        return this.#permissions;
    }

    /**
     * Gets when the user account was created.
     * @returns when the user account was created
     */
    get createdAt(): Date {
        return this.#createdAt;
    }

}