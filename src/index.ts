import dotenv from 'dotenv';
import { initDB } from './initDB';
import { UsersAuthServiceImpl } from './services/UsersAuthServiceImpl';
import { initAPI } from './initAPI';
import { UsersRoleServiceImpl } from './services/UsersRoleServiceImpl';

const DEV_ENV = true;

dotenv.config({ path: DEV_ENV ? '.env.dev' : '.env.prod' });

initDB(process.env.DB_API_KEY as string, `http://localhost:${process.env.DB_PORT}/api/v1`).then(async dbApi => {
    console.log("Database initialized successfully.");

    const usersAuthService = new UsersAuthServiceImpl(dbApi);
    const usersRoleService = new UsersRoleServiceImpl(dbApi);

    initAPI(usersAuthService, usersRoleService).then(() => {
        console.log("API initialized successfully.");
    }).catch((err) => {
        console.error("Failed to initialize API:", err);
        process.exit(1);
    });

});