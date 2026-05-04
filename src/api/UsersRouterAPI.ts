import { NextFunction, Request, Response, Router } from "express";
import { UsersAuthService } from "../services/UsersAuthService";
import { asyncHandler } from "../Utils";
import { AuthedRequest } from "./Authenticator";
import { User } from "../model/User";

export class UsersRouterAPI {
    readonly #usersAuthService: UsersAuthService;
    readonly #authenticate: (req: Request, res: Response, next: NextFunction) => void;

    constructor(usersAuthService: UsersAuthService, authenticate: (req: Request, res: Response, next: NextFunction) => void) {
        this.#usersAuthService = usersAuthService;
        this.#authenticate = authenticate;
    }

    public registerRoutes(): Router {
        const router = Router();

        // register
        router.post("/register", asyncHandler(async (req: Request, res: Response) => {
            const token = await this.#usersAuthService.registerUser(req.body.username, req.body.email, req.body.password);
            res.cookie("token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" });
            res.status(201).json({ message: "User registered successfully" });
        }));

        // login
        router.post("/login", asyncHandler(async (req: Request, res: Response) => {
            const token = await this.#usersAuthService.loginUser(req.body.username, req.body.password);
            res.cookie("token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" });
            res.status(200).json({ message: "User logged in successfully" });
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
        router.get("/", this.#authenticate, asyncHandler(async (req: AuthedRequest, res: Response) => {
            console.log("User permissions:", req.userPermissions);
            console.log("User making request:", req.user);
            console.log("Received request to get all users");
            const users = await this.#usersAuthService.getUsers();
            res.status(200).json(users.map(user => user.toDictionary()));
        }));

        return router;
    }
}