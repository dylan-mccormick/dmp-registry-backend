import helmet from "helmet";
import cors from "cors";
import express from "express";
import cookieParser from "cookie-parser";

import rateLimit from "express-rate-limit";
import { UsersAuthService } from "./services/UsersAuthService";
import bodyParser from "body-parser";
import { UsersRouterAPI } from "./api/UsersRouterAPI";
import { Authenticator } from "./api/Authenticator";
import { UsersRoleService } from "./services/UsersRoleService";
import errorHandler from "./api/errorHandler";

export const initAPI = (usersAuthService: UsersAuthService, usersRoleService: UsersRoleService): Promise<void> => {
    return new Promise((resolve, reject) => {
        // rate limiting
        const limiter = rateLimit({
            windowMs: 2 * 60 * 1000, // 2 minutes
            max: 100, // limit each IP to 100 requests per windowMs
        });

        const app = express();

        // init api services
        const authenticator = new Authenticator(usersAuthService, usersRoleService);

        // use modules
        app.use(cors({
            origin: (origin, callback) => {
                if (!origin) return callback(null, true);

                const allowed = [
                    /^https:\/\/.*\.mnmzc\.us\.to$/,
                    /^http:\/\/localhost:5173$/
                ];

                if (allowed.some(pattern => pattern.test(origin))) {
                    callback(null, true);
                } else {
                    callback(new Error(`CORS: origin ${origin} not allowed`));
                }
            },
            credentials: true
        }));

        app.use(helmet());
        app.use(cookieParser());
        app.use(bodyParser.urlencoded({ extended: false }));
        app.use(bodyParser.json());
        app.use(limiter);

        // register routes
        const usersRouterAPI = new UsersRouterAPI(usersAuthService, usersRoleService, authenticator);
        const usersRouter = usersRouterAPI.registerRoutes();

        // start server
        const PORT = process.env.PORT || 3000;
        app.use("/api/v1/users", usersRouter);

        app.use(errorHandler);

        app.listen(PORT, () => {
            console.log(`API server is running on port ${PORT}`);
            resolve();
        }).on("error", (err) => {
            console.error("Failed to start API server:", err);
            reject(err);
        });
    });
}