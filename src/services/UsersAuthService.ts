/**
 * UsersAuthService.ts
 * This file defines the contract for the UsersAuthService class, which is responsible for managing authentication-related operations for a user.
 * It interacts with the database to retrieve and update user information, as well as manage user permissions.
 */

import { User } from "../model/User";

export interface UsersAuthService {

    /**
     * Retrieves a list of all users in the system.
     * @returns A promise that resolves to an array of User objects.
     */
    getUsers(): Promise<User[]>;

    /**
     * Retrieves a user by their ID.
     * @param id the id of the user to get
     * @returns A promise that resolves to a User object.
     */
    getUserById(id: number): Promise<User>;

    /**
     * Deletes a user from the system.
     * @param user the user to delete
     */
    deleteUser(user: User): Promise<void>;

    /**
     * Registers a new user in the system.
     * @param username the username to create
     * @param email the email to set
     * @param password the password to set
     * @returns A promise that resolves to the created User object.
     */
    registerUser(username: string, email: string, password: string): Promise<User>;

    /**
     * Logs in a user to the system.
     * @param username the username to log into
     * @param password the password that goes with the username
     * @returns A promise that resolves to the logged-in User object.
     */
    loginUser(username: string, password: string): Promise<User>;

    /**
     * Logs out a user from the system.
     * @param user the user to logout
     */
    logoutUser(user: User): Promise<void>;

}