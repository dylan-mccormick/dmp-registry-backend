import { NextFunction, Request, Response, Router } from "express";
import { UserPermissions } from "../model/UserPermissions";
import { RegistryLifecycleService } from "../services/RegistryLifecycleService";
import { AuthedRegistryRequest, AuthedRequest, Authenticator } from "./Authenticator";
import { asyncHandler } from "../Utils";
import { CreateRegistryDetailsSchema, RegistryIdQuerySchema, RegistryPermissionNameArrayQuerySchema, UpdateRegistryDetailsSchema } from "./schema/RegistryLifecycleSchema";
import { UsersAuthService } from "../services/UsersAuthService";
import { RegistryActorRoleService } from "../services/RegistryActorRoleService";
import { ActorPermissions } from "../model/ActorPermissions";
import { UserIdQuerySchema, UserPasswordOnlyQuerySchema, UserSearchQuerySchema } from "./schema/UserQuerySchema";

export class RegistryRouterAPI {
    readonly #registryLifecycleService: RegistryLifecycleService;
    readonly #registryActorRoleService: RegistryActorRoleService;
    readonly #usersAuthService: UsersAuthService;
    readonly #authenticate: (req: Request, res: Response, next: NextFunction) => void;
    readonly #requiredPermissions: (permissions: UserPermissions[]) => (req: Request, res: Response, next: NextFunction) => void;
    readonly #requiredRegistryPermissions: (permissions: ActorPermissions[]) => (req: Request, res: Response, next: NextFunction) => void;

    constructor(registryLifecycleService: RegistryLifecycleService, registryActorRoleService: RegistryActorRoleService, usersAuthService: UsersAuthService, authenticator: Authenticator) {
        this.#registryLifecycleService = registryLifecycleService;
        this.#registryActorRoleService = registryActorRoleService;
        this.#usersAuthService = usersAuthService;
        this.#authenticate = authenticator.authenticate.bind(authenticator);
        this.#requiredPermissions = authenticator.requiredPermissions.bind(authenticator);
        this.#requiredRegistryPermissions = authenticator.requiredRegistryPermissions.bind(authenticator);
    }



    public registerRoutes(): Router {
        const router = Router();

        /* REGISTRY LIFECYCLE + ROLES */

        // Get user's registries
        router.get("/list/me", this.#authenticate, asyncHandler(async (req: AuthedRequest, res: Response) => {
            const registries = await this.#registryLifecycleService.getRegistriesForUser(req.user.id);
            const result = await Promise.all(registries.map(async r => (
                {
                    id: r.id,
                    name: r.name,
                    type: r.type,
                    owner: r.createdByUserId ? await this.#usersAuthService.getUserById(r.createdByUserId).then(user => user.username) : null,
                    createdAt: r.createdAt
                }
            )));
            res.status(200).json(result);
        }))

        // Create a new registry
        router.post("/new", this.#authenticate, this.#requiredPermissions([ UserPermissions.CREATE_REGISTRY ]), asyncHandler(async (req: AuthedRequest, res: Response) => {
            const { name, type } = CreateRegistryDetailsSchema.parse(req.body);
            if (await this.#registryLifecycleService.getRegistryByName(name)) return res.status(400).json({ message: "Registry name is already in use" });
            const result = await this.#registryLifecycleService.createRegistry(name, req.user, type);
            res.status(201).json({ message: "Created registry successfully", id: result.id });
        }))

        // Get all users for a registry plus their respective permissions
        router.get("/:registryId/users", this.#authenticate, this.#requiredRegistryPermissions([ ActorPermissions.MANAGE_USERS ]), asyncHandler(async (req: AuthedRegistryRequest, res: Response) => {
            const { registryId } = RegistryIdQuerySchema.parse(req.params);
            const registry = await this.#registryLifecycleService.getRegistryById(registryId);
            if (registry == null) return res.status(404).json({ message: "Registry not found" });

            const addedUsers = await this.#registryActorRoleService.getUsersWithRole(registry, ActorPermissions.READ_REGISTRY);
            const results = await Promise.all(addedUsers.map(async u => {
                const userDict = { id: u.id, username: u.username, permissions: [] as ActorPermissions[] };
                userDict.permissions = await this.#registryActorRoleService.getUserRoles(registry, u);
                return userDict;
            }));

            res.status(200).json({ users: results });
        }));

        // Delete a registry -- requires owner's password
        router.delete("/:registryId", this.#authenticate, this.#requiredPermissions([ UserPermissions.CREATE_REGISTRY ]), asyncHandler(async (req: AuthedRequest, res: Response) => {
            const { registryId } = RegistryIdQuerySchema.parse(req.params);
            const { password } = UserPasswordOnlyQuerySchema.parse(req.body);

            const registry = await this.#registryLifecycleService.getRegistryById(registryId);
            if (registry == null) return res.status(404).json({ message: "Registry not found" });
            if (registry.createdByUserId == null) return res.status(404).json({ message: "Registry is not owned" });
            const owner = await this.#usersAuthService.getUserById(registry.createdByUserId);
            if (owner == null) return res.status(404).json({ message: "Registry owner not found" });
            if (owner.id != req.user.id) return res.status(403).json({ message: "Only the registry owner may delete the registry" });

            if (!(await this.#usersAuthService.verifyPassword(owner, password))) return res.status(403).json({ message: "Incorrect password" });

            // proceed with registry deletion
            await this.#registryLifecycleService.deleteRegistry(registryId);
            res.status(200).json({ message: "Deleted registry successfully" });
        }));

        // Update a regustry
        router.put("/:registryId", this.#authenticate, this.#requiredPermissions([ UserPermissions.CREATE_REGISTRY ]), asyncHandler(async (req: AuthedRequest, res: Response) => {
            const { registryId } = RegistryIdQuerySchema.parse(req.params);
            const { name } = UpdateRegistryDetailsSchema.parse(req.body);

            if (!name) return res.status(304).json({ message: "No changes made" });

            const registry = await this.#registryLifecycleService.getRegistryById(registryId);
            if (registry == null) return res.status(404).json({ message: "Registry not found" });
            if (registry.createdByUserId == null) return res.status(404).json({ message: "Registry is not owned" });
            const owner = await this.#usersAuthService.getUserById(registry.createdByUserId);
            if (owner == null) return res.status(404).json({ message: "Registry owner not found" });
            if (owner.id != req.user.id) return res.status(403).json({ message: "Only the registry owner may update the registry" });

            // check if name can be changed
            if (await this.#registryLifecycleService.getRegistryByName(name)) return res.status(409).json({ message: "Registry with this name already exists" });

            // update the name
            await this.#registryLifecycleService.changeRegistryName(registry, name);
            res.status(200).json({ message: "Registry updated successfully" });
        }))

        // Search for users (to add to registry)
        router.get("/:registryId/users/search", this.#authenticate, this.#requiredRegistryPermissions([ ActorPermissions.MANAGE_USERS ]), asyncHandler(async (req: AuthedRegistryRequest, res: Response) => {
            const { search } = UserSearchQuerySchema.parse(req.query);
            const { registryId } = RegistryIdQuerySchema.parse(req.params);
            if (!search) return res.status(400).json({ message: "Query parameter is required" });
            const users = await this.#usersAuthService.searchUser(search);

            // find out users who arent in registry
            const existingUsers = await this.#registryActorRoleService.getUsersWithRole(await this.#registryLifecycleService.getRegistryById(registryId), ActorPermissions.READ_REGISTRY);
            const difference = users.filter(u => !existingUsers.map(eu => eu.id).includes(u.id));

            res.status(200).json(difference.map(user => ({ id: user.id, username: user.username })));
        }));

        // Add a user to the registry
        router.post("/:registryId/users/:userId", this.#authenticate, this.#requiredRegistryPermissions([ ActorPermissions.MANAGE_USERS ]), asyncHandler(async (req: AuthedRegistryRequest, res: Response) => {
            const { registryId } = RegistryIdQuerySchema.parse(req.params);
            const { userId } = UserIdQuerySchema.parse(req.params);

            // Find user and registry
            const registry = await this.#registryLifecycleService.getRegistryById(registryId);
            if (registry == null) return res.status(404).json({ message: "Registry not found" });
            const user = await this.#usersAuthService.getUserById(userId);
            if (user == null) return res.status(404).json({ message: "User not found" });

            // Apply permissions
            await this.#registryActorRoleService.grantUserRole(registry, user, ActorPermissions.READ_REGISTRY);
            res.status(200).json({ message: "Added user to registry" });
        }));

        // Remove a user from the registry
        router.delete("/:registryId/users/:userId", this.#authenticate, this.#requiredRegistryPermissions([ ActorPermissions.MANAGE_USERS ]), asyncHandler(async (req: AuthedRegistryRequest, res: Response) => {
            const { registryId } = RegistryIdQuerySchema.parse(req.params);
            const { userId } = UserIdQuerySchema.parse(req.params);

            // Find user and registry
            const registry = await this.#registryLifecycleService.getRegistryById(registryId);
            if (registry == null) return res.status(404).json({ message: "Registry not found" });
            const user = await this.#usersAuthService.getUserById(userId);
            if (user == null) return res.status(404).json({ message: "User not found" });

            // Revoke ALL permissions
            for (const p of Object.values(ActorPermissions)) {
                await this.#registryActorRoleService.revokeUserRole(registry, user, p);
            }
            res.status(200).json({ message: "All roles revoked." });
        }));

        router.post("/:registryId/users/:userId/permissions", this.#authenticate, this.#requiredRegistryPermissions([ ActorPermissions.MANAGE_USERS ]), asyncHandler(async (req: AuthedRegistryRequest, res: Response) => {
            const { registryId } = RegistryIdQuerySchema.parse(req.params);
            const { userId } = UserIdQuerySchema.parse(req.params);
            const { permissions } = RegistryPermissionNameArrayQuerySchema.parse(req.body);

            // Find user and registry
            const registry = await this.#registryLifecycleService.getRegistryById(registryId);
            if (registry == null) return res.status(404).json({ message: "Registry not found" });
            const user = await this.#usersAuthService.getUserById(userId);
            if (user == null) return res.status(404).json({ message: "User not found" });

            // grant requested permissions
            for (const p of permissions) {
                await this.#registryActorRoleService.grantUserRole(registry, user, p);
            }
            res.status(200).json({ message: "Roles granted." });
        }));

        router.delete("/:registryId/users/:userId/permissions", this.#authenticate, this.#requiredRegistryPermissions([ ActorPermissions.MANAGE_USERS ]), asyncHandler(async (req: AuthedRegistryRequest, res: Response) => {
            const { registryId } = RegistryIdQuerySchema.parse(req.params);
            const { userId } = UserIdQuerySchema.parse(req.params);
            const { permissions } = RegistryPermissionNameArrayQuerySchema.parse(req.body);

            // Find user and registry
            const registry = await this.#registryLifecycleService.getRegistryById(registryId);
            if (registry == null) return res.status(404).json({ message: "Registry not found" });
            const user = await this.#usersAuthService.getUserById(userId);
            if (user == null) return res.status(404).json({ message: "User not found" });

            // revoke requested permissions
            for (const p of permissions) {
                await this.#registryActorRoleService.revokeUserRole(registry, user, p);
            }
            res.status(200).json({ message: "Roles revoked." });
        }));

        // Get general details about a registry
        router.get("/:registryId/details", this.#authenticate, this.#requiredRegistryPermissions([ ActorPermissions.READ_REGISTRY ]), asyncHandler(async (req: AuthedRegistryRequest, res: Response) => {
            const { registryId } = RegistryIdQuerySchema.parse(req.params);
            const result = await this.#registryLifecycleService.getRegistryById(registryId);
            if (!result) return res.status(404).json({ message: "Registry not found" });
            // get information to populate owner fields
            const dict: any = result.toDictionary() as any;
            if (result.createdByUserId) {
                const creatorInfo = await this.#usersAuthService.getUserById(result.createdByUserId);
                dict.creatorUsername = creatorInfo.username;
            }
            res.status(200).json(dict);
        }))

        // Get my permissions about a registry
        router.get("/:registryId/permissions/me", this.#authenticate, this.#requiredRegistryPermissions([ ActorPermissions.READ_REGISTRY ]), asyncHandler(async (req: AuthedRegistryRequest, res: Response) => {
            const { registryId } = RegistryIdQuerySchema.parse(req.params);
            const registry = await this.#registryLifecycleService.getRegistryById(registryId);
            if (!registry) return res.status(404).json({ message: "Registry not found" });
            // get personal permissions
            const permissions = await this.#registryActorRoleService.getUserRoles(registry, req.user);
            res.status(200).json(permissions);
        }))

        return router;
    }
}