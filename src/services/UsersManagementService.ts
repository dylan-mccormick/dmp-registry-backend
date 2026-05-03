/**
 * UsersManagementService.ts
 * This file defines the contract for the UsersManagementService class, which is responsible for managing details about a user account,
 * such as their profile information and permissions. It interacts with the database to retrieve and update user information, as well as manage user permissions.
 */

import { User } from "../model/User";

export interface UsersManagementService {

    /**
     * Sets the username for a user.
     * @param user the user to set the username of
     * @param username the username to set
     * @return A promise that resolves to the updated User object.
     */
    setUsername(user: User, username: string): Promise<User>;

    /**
     * Sets the email for a user. Also sets emailVerified to false, as the user will need to verify their new email address.
     * @param user the user to set the email of
     * @param email the email to set
     * @return A promise that resolves to the updated User object.
     */
    setEmail(user: User, email: string): Promise<User>;

    /**
     * Sets the emailVerified field for a user.
     * @param user the user to set emailVerified of
     * @param emailVerified whether the email is verified
     * @return A promise that resolves to the updated User object.
     */
    setEmailVerified(user: User, emailVerified: boolean): Promise<User>;

    /**
     * Sets the password for a user.
     * @param user the user to set the password of
     * @param password the password to set
     * @return A promise that resolves to the updated User object.
     */
    setPassword(user: User, password: string): Promise<User>;

    /**
     * Sets the token version for a user.
     * @param user the user to set the token version of
     * @param tokenVersion the token version to set
     * @return A promise that resolves to the updated User object.
     */
    setTokenVersion(user: User, tokenVersion: number): Promise<User>;

}