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

const DEV_ENV = true;

dotenv.config({ path: DEV_ENV ? '.env.dev' : '.env.prod' });

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

    initAPI(usersAuthService, usersRoleService, usersManagementService, registryLifecycleService, registryActorRoleService).then(async () => {
        console.log("API initialized successfully.");

    }).catch((err) => {
        console.error("Failed to initialize API:", err);
        process.exit(1);
    });

});