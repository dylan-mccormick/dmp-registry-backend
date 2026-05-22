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

const DEV_ENV = true;

dotenv.config({ path: DEV_ENV ? '.env.dev' : '.env.prod' });

initDB(process.env.DB_API_KEY as string, `http://${process.env.DB_HOST}:${process.env.DB_PORT}/api/v1`).then(async dbApi => {
    console.log("Database initialized successfully.");

    const usersManagementService: UsersManagementService = new UsersManagementServiceImpl(dbApi);
    const usersAuthService: UsersAuthService = new UsersAuthServiceImpl(dbApi, usersManagementService);
    const usersRoleService: UsersRoleService = new UsersRoleServiceImpl(dbApi);

    // await verifyUserPermissionsExist(dbApi);
    // await verifyRegistryActorPermissionsExist(dbApi);

    initAPI(usersAuthService, usersRoleService, usersManagementService).then(() => {
        console.log("API initialized successfully.");
    }).catch((err) => {
        console.error("Failed to initialize API:", err);
        process.exit(1);
    });

});