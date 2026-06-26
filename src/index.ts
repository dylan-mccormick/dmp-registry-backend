import dotenv from 'dotenv';
import { initDB } from './initDB';
import { UsersAuthServiceImpl } from './services/UsersAuthServiceImpl';
import { initAPI } from './initAPI';
import { UsersRoleServiceImpl } from './services/UsersRoleServiceImpl';
import { verifyRegistryActorPermissionsExist, verifyUserPermissionsExist } from './verifyPermissionsExist';
import { UsersManagementServiceImpl } from './services/UsersManagementServiceImpl';
import { RegistryLifecycleServiceImpl } from './services/RegistryLifecycleServiceImpl';
import { RegistryActorRoleServiceImpl } from './services/RegistryActorRoleServiceImpl';
import { RegistryAgentServiceImpl } from './services/RegistryAgentServiceImpl';
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

    const usersManagementService = new UsersManagementServiceImpl(dbApi);
    const usersAuthService = new UsersAuthServiceImpl(dbApi, usersManagementService);
    const usersRoleService = new UsersRoleServiceImpl(dbApi);

    const registryActorRoleService = new RegistryActorRoleServiceImpl(dbApi);
    const registryLifecycleService = new RegistryLifecycleServiceImpl(dbApi, registryActorRoleService);
    const registryAgentService = new RegistryAgentServiceImpl(dbApi, usersAuthService, registryLifecycleService);

    await verifyUserPermissionsExist(dbApi);
    await verifyRegistryActorPermissionsExist(dbApi);

    const authenticator = new Authenticator(usersAuthService, usersRoleService, registryLifecycleService, registryActorRoleService, registryAgentService);

    initAPI(usersAuthService, usersRoleService, usersManagementService, registryLifecycleService, registryActorRoleService, registryAgentService).then(async app => {
        console.log("API initialized successfully.");

        // Initialize workers
        const routerRegistryService: RouterRegistryService = new RouterRegistryServiceImpl(app);
        const registryWorkerService: RegistryWorkerService = new RegistryWorkerServiceImpl(routerRegistryService, authenticator);

        // on close, close all connections
        process.on("SIGHUP", async () => await cleanupRegistryWorkerService(registryWorkerService));
        process.on("SIGINT", async () => await cleanupRegistryWorkerService(registryWorkerService));
        process.on("SIGTERM", async () => await cleanupRegistryWorkerService(registryWorkerService));

        // spawn all worker processes
        const registries = await registryLifecycleService.getRegistries();
        registryWorkerService.bulkStartWorkers(registries).then(() => {
            console.log("All registry workers started.");
        }).catch(err => {
            console.error("Registry workers failed to start:", err);
            process.exit(1);
        })

    }).catch((err) => {
        console.error("Failed to initialize API:", err);
        process.exit(1);
    });

});