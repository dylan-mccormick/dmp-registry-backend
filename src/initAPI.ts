import helmet from "helmet";
import cors from "cors";
import express from "express";
import cookieParser from "cookie-parser";

import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { UsersAuthService } from "./services/UsersAuthService";
import bodyParser from "body-parser";
import { UsersRouterAPI } from "./api/UsersRouterAPI";
import { Authenticator } from "./api/Authenticator";
import { UsersRoleService } from "./services/UsersRoleService";
import errorHandler from "./api/errorHandler";
import { UsersManagementService } from "./services/UsersManagementService";

export const initAPI = (usersAuthService: UsersAuthService, usersRoleService: UsersRoleService, usersManagementService: UsersManagementService): Promise<void> => {
    return new Promise((resolve, reject) => {
        // rate limiting
        const limiter = rateLimit({
            windowMs: 2 * 60 * 1000, // 2 minutes
            max: 120, // limit each IP to 120 requests per windowMs
        });

        const app = express();

        // init api services
        const authenticator = new Authenticator(usersAuthService, usersRoleService);

        app.set('trust proxy', 1);

        // use modules
        app.use(cors({
            origin: (origin, callback) => {
                if (!origin) return callback(null, true);

                const allowed = [
                    /^https:\/\/.*\.mnmzc\.us\.to$/,
                    /^http:\/\/localhost(:\d+)?$/,
                    /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/
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
        app.use(morgan("combined"));
        app.use(bodyParser.urlencoded({ extended: false }));
        app.use(bodyParser.json());
        app.use(limiter);

        // register routes
        const usersRouterAPI = new UsersRouterAPI(usersAuthService, usersRoleService, usersManagementService, authenticator);
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