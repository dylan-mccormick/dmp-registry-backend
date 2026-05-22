import { NextFunction, Request, Response, Router } from "express";
import { UsersAuthService } from "../services/UsersAuthService";
import { asyncHandler } from "../Utils";
import { AuthedRequest, Authenticator } from "./Authenticator";
import { User } from "../model/User";
import { UserPermissions } from "../model/UserPermissions";
import { UsersRoleService } from "../services/UsersRoleService";
import { UserAdminUpdateQuerySchema, UserCreateQuerySchema, UserIdPermissionQuerySchema, UserIdQuerySchema, UserPasswordOnlyQuerySchema, UserPasswordUpdateQuerySchema, UserPersonalUpdateQuerySchema } from "./schema/UserQuerySchema";
import { UsersManagementService } from "../services/UsersManagementService";
import { AxiosError } from "axios";

export class UsersRouterAPI {
    readonly #usersAuthService: UsersAuthService;
    readonly #usersRoleService: UsersRoleService;
    readonly #usersManagementService: UsersManagementService;
    readonly #authenticate: (req: Request, res: Response, next: NextFunction) => void;
    readonly #requiredPermissions: (permissions: UserPermissions[]) => (req: Request, res: Response, next: NextFunction) => void;

    constructor(usersAuthService: UsersAuthService, usersRoleService: UsersRoleService, usersManagementService: UsersManagementService, authenticator: Authenticator) {
        this.#usersAuthService = usersAuthService;
        this.#usersRoleService = usersRoleService;
        this.#usersManagementService = usersManagementService;
        this.#authenticate = authenticator.authenticate.bind(authenticator);
        this.#requiredPermissions = authenticator.requiredPermissions.bind(authenticator);
    }

    public registerRoutes(): Router {
        const router = Router();

        // register
        router.post("/register", asyncHandler(async (req: Request, res: Response) => {
            const { username, email, password } = UserCreateQuerySchema.parse(req.body);
            try {
                const token = await this.#usersAuthService.registerUser(username, email, password);

                res.cookie("token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax" });
                res.status(201).json({ message: "User registered successfully" });
            } catch (error) {
                if (error instanceof AxiosError && error.response?.data?.code === "USERNAME_ALREADY_IN_USE") {
                    return res.status(400).json({ message: "Username already in use" });
                }
                return res.status(400).json({ message: "Failed to register user" });
            }
        }));

        // login
        router.post("/login", asyncHandler(async (req: Request, res: Response) => {
            try {
                const token = await this.#usersAuthService.loginUser(req.body.username, req.body.password);
                res.cookie("token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax" });
                res.status(200).json({ message: "User logged in successfully" });
            } catch (error) {
                return res.status(401).json({ message: "Invalid credentials" });
            }
        }));

        // logout
        router.post("/logout", this.#authenticate, asyncHandler(async (req: AuthedRequest, res: Response) => {
            if (!req.user) res.status(401).json({ error: "Unauthorized: No user authenticated" });
            await this.#usersAuthService.logoutUser(req.user as User);
            res.clearCookie("token");
            res.status(200).json({ message: "User logged out successfully" });
        }));

        // auth/me
        router.get("/auth/me", this.#authenticate, asyncHandler(async (req: AuthedRequest, res: Response) => {
            if (!req.user) res.status(401).json({ error: "Unauthorized: No user authenticated" });
            res.status(200).json((req.user as User).toDictionary());
        }));

        // list users
        router.get("/list", this.#authenticate, this.#requiredPermissions([UserPermissions.MANAGE_USERS]), asyncHandler(async (req: AuthedRequest, res: Response) => {
            const users = await this.#usersAuthService.getUsers();
            res.status(200).json(users.map(user => user.toDictionary()));
        }));

        // get user-permissions
        router.get("/permissions", this.#authenticate, asyncHandler(async (req: AuthedRequest, res: Response) => {
            const user = req.user as User;
            const permissions = await this.#usersRoleService.getPermissionsOnUser(user);
            res.status(200).json(permissions.map(permission => permission.toString()));
        }));

        // get all user-permissions
        router.get("/permissions/all", this.#authenticate, this.#requiredPermissions([UserPermissions.MANAGE_USERS]), asyncHandler(async (req: AuthedRequest, res: Response) => {
            const permissions = await this.#usersRoleService.getPermissions();
            res.status(200).json(permissions.map(permission => permission.toString()));
        }));

        // personal details update (email, username, password)
        router.patch("/update/me", this.#authenticate, asyncHandler(async (req: AuthedRequest, res: Response) => {
            const user = req.user as User;
            const { email, username, password } = UserPersonalUpdateQuerySchema.parse(req.body);

            // update user details
            try {
                if (email) await this.#usersManagementService.setEmail(user, email);
                if (username) await this.#usersManagementService.setUsername(user, username);
                if (password) await this.#usersManagementService.setPassword(user, password);
            } catch (error) {
                if (error instanceof AxiosError && error.response?.data?.code === "USERNAME_ALREADY_IN_USE") {
                    return res.status(400).json({ message: "Username already in use" });
                }
                return res.status(400).json({ message: "Failed to update user details" });
            }

            res.status(200).json({ message: "User updated successfully", user: (await this.#usersAuthService.getUserById(user.id))?.toDictionary()});
        }));

        // password update
        router.patch("/change-password/me", this.#authenticate, asyncHandler(async (req: AuthedRequest, res: Response) => {
            const { oldPassword, newPassword } = UserPasswordUpdateQuerySchema.parse(req.body);
            const user = req.user as User;

            if (!(await this.#usersAuthService.verifyPassword(user, oldPassword))) {
                return res.status(403).json({ message: "Incorrect old password" });
            }

            await this.#usersManagementService.setPassword(user, newPassword);
            res.status(200).json({ message: "Password updated successfully" });
        }));

        // personal account deletion
        router.delete("/delete/me", this.#authenticate, asyncHandler(async (req: AuthedRequest, res: Response) => {
            console.log(req.body);
            const { password } = UserPasswordOnlyQuerySchema.parse(req.body);
            console.log(password)

            // verify password
            if (!(await this.#usersAuthService.verifyPassword(req.user as User, password))) {
                return res.status(403).json({ message: "Incorrect password" });
            }

            // delete their account
            await this.#usersAuthService.deleteUser(req.user as User);
            res.clearCookie("token");
            res.status(200).json({ message: "User deleted successfully" });
        }));

        // get permission for user
        router.get("/:userId/permissions", this.#authenticate, this.#requiredPermissions([UserPermissions.MANAGE_USERS]), asyncHandler(async (req: AuthedRequest, res: Response) => {
            const { userId } = UserIdQuerySchema.parse(req.params);
            const user = await this.#usersAuthService.getUserById(userId);
            if (!user) return res.status(404).json({ error: "User not found" });
            const permissions = await this.#usersRoleService.getPermissionsOnUser(user);
            res.status(200).json(permissions.map(permission => permission.toString()));
        }));

        // assign permission to user
        router.post("/:userId/permissions/:permission", this.#authenticate, this.#requiredPermissions([UserPermissions.MANAGE_USERS]), asyncHandler(async (req: AuthedRequest, res: Response) => {
            const { userId, permission } = UserIdPermissionQuerySchema.parse(req.params);
            const user = await this.#usersAuthService.getUserById(userId);
            const permEnum = UserPermissions[permission as keyof typeof UserPermissions];
            if (!user) return res.status(404).json({ error: "User not found" });
            if (!permEnum) return res.status(400).json({ error: "Invalid permission" });

            await this.#usersRoleService.assignPermissionToUser(user, permEnum);
            res.status(200).json({ message: "Permission assigned successfully" });
        }));

        // remove permission from user
        router.delete("/:userId/permissions/:permission", this.#authenticate, this.#requiredPermissions([UserPermissions.MANAGE_USERS]), asyncHandler(async (req: AuthedRequest, res: Response) => {
            const { userId, permission } = UserIdPermissionQuerySchema.parse(req.params);
            const user = await this.#usersAuthService.getUserById(userId);
            const permEnum = UserPermissions[permission as keyof typeof UserPermissions];
            if (!user) return res.status(404).json({ error: "User not found" });
            if (!permEnum) return res.status(400).json({ error: "Invalid permission" });

            await this.#usersRoleService.removePermissionFromUser(user, permEnum);
            res.status(200).json({ message: "Permission removed successfully" });
        }));

        // get all details of a user
        router.get("/:userId", this.#authenticate, this.#requiredPermissions([UserPermissions.MANAGE_USERS]), asyncHandler(async (req: AuthedRequest, res: Response) => {
            const { userId } = UserIdQuerySchema.parse(req.params);
            const user = await this.#usersAuthService.getUserById(userId);
            if (!user) return res.status(404).json({ error: "User not found" });
            res.status(200).json(user.toDictionary());
        }));

        // delete a user
        router.delete("/:userId", this.#authenticate, this.#requiredPermissions([UserPermissions.MANAGE_USERS]), asyncHandler(async (req: AuthedRequest, res: Response) => {
            const { userId } = UserIdQuerySchema.parse(req.params);
            const user = await this.#usersAuthService.getUserById(userId);
            if (!user) return res.status(404).json({ error: "User not found" });
            await this.#usersAuthService.deleteUser(user);
            res.status(200).json({ message: "User deleted successfully" });
        }));

        // update user details (email, username, emailVerified)
        router.patch("/:userId", this.#authenticate, this.#requiredPermissions([UserPermissions.MANAGE_USERS]), asyncHandler(async (req: AuthedRequest, res: Response) => {
            const { userId } = UserIdQuerySchema.parse(req.params);
            const user = await this.#usersAuthService.getUserById(userId);
            if (!user) return res.status(404).json({ error: "User not found" });

            const { email, username, email_verified } = UserAdminUpdateQuerySchema.parse(req.body);

            // update user details
            try {
                if (email) await this.#usersManagementService.setEmail(user, email);
                if (username) await this.#usersManagementService.setUsername(user, username);
                if (email_verified !== undefined) await this.#usersManagementService.setEmailVerified(user, email_verified);
            } catch (error) {
                if (error instanceof AxiosError && error.response?.data?.code === "USERNAME_ALREADY_IN_USE") {
                    return res.status(400).json({ message: "Username already in use" });
                }
                return res.status(400).json({ message: "Failed to update user details" });
            }

            res.status(200).json({ message: "User updated successfully", user: (await this.#usersAuthService.getUserById(userId))?.toDictionary()});
        }));

        return router;
    }
}