import dotenv from 'dotenv';
import { initDB } from './initDB';
import { UsersAuthServiceImpl } from './services/UsersAuthServiceImpl';
import { initAPI } from './initAPI';
import { UsersRoleServiceImpl } from './services/UsersRoleServiceImpl';
import { verifyRegistryActorPermissionsExist, verifyUserPermissionsExist } from './verifyPermissionsExist';
import { UsersManagementServiceImpl } from './services/UsersManagementServiceImpl';
import { UsersManagementService } from './services/UsersManagementService';
import { UsersAuthService } from './services/UsersAuthService';
import { UsersRoleService } from './services/UsersRoleService';
import { RegistryLifecycleServiceImpl } from './services/RegistryLifecycleServiceImpl';
import { RegistryLifecycleService } from './services/RegistryLifecycleService';
import { RegistryActorRoleService } from './services/RegistryActorRoleService';
import { RegistryActorRoleServiceImpl } from './services/RegistryActorRoleServiceImpl';
import { RegistryType } from './model/RegistryType';
import { ActorPermissions } from './model/ActorPermissions';
import { RegistryWorkerService } from './services/RegistryWorkerService';
import { RegistryWorkerServiceImpl } from './services/RegistryWorkerServiceImpl';
import { RouterRegistryService } from './services/RouterRegistryService';
import { RouterRegistryServiceImpl } from './services/RouterRegistryServiceImpl';
import { Authenticator } from './api/Authenticator';

const DEV_ENV = true;

dotenv.config({ path: DEV_ENV ? '.env.dev' : '.env.prod' });

const cleanupRegistryWorkerService = async (svc: RegistryWorkerService): Promise<void> => {
    console.log("Stopping all registry workers...");
    await svc.bulkStopWorkers(svc.getActiveRegistryIds());
    console.log("Registry workers terminated.");
    process.exit(0);
}

initDB(process.env.DB_API_KEY as string, `http://${process.env.DB_HOST}:${process.env.DB_PORT}/api/v1`).then(async dbApi => {
    console.log("Database initialized successfully.");

    const usersManagementService: UsersManagementService = new UsersManagementServiceImpl(dbApi);
    const usersAuthService: UsersAuthService = new UsersAuthServiceImpl(dbApi, usersManagementService);
    const usersRoleService: UsersRoleService = new UsersRoleServiceImpl(dbApi);

    const registryActorRoleService: RegistryActorRoleService = new RegistryActorRoleServiceImpl(dbApi);
    const registryLifecycleService: RegistryLifecycleService = new RegistryLifecycleServiceImpl(dbApi, registryActorRoleService);

    await verifyUserPermissionsExist(dbApi);
    await verifyRegistryActorPermissionsExist(dbApi);

    const authenticator = new Authenticator(usersAuthService, usersRoleService, registryLifecycleService, registryActorRoleService);

    initAPI(usersAuthService, usersRoleService, usersManagementService, registryLifecycleService, registryActorRoleService, authenticator).then(async app => {
        console.log("API initialized successfully.");

        // Initialize workers
        const routerRegistryService: RouterRegistryService = new RouterRegistryServiceImpl(app);
        const registryWorkerService: RegistryWorkerService = new RegistryWorkerServiceImpl(routerRegistryService, authenticator);

        // on close, close all connections
        process.on("SIGHUP", async () => await cleanupRegistryWorkerService(registryWorkerService));
        process.on("SIGINT", async () => await cleanupRegistryWorkerService(registryWorkerService));
        process.on("SIGTERM", async () => await cleanupRegistryWorkerService(registryWorkerService));

        // test:
        registryWorkerService.startWorker(await registryLifecycleService.getRegistryById(7)).then(() => {
            console.log("Started worker successfully.");
        }).catch(err => {
            console.error("Failed to start worker", err);
        })

    }).catch((err) => {
        console.error("Failed to initialize API:", err);
        process.exit(1);
    });

});