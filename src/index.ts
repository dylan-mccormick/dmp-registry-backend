import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { initDB } from './initDB';

const DEV_ENV = true;

dotenv.config({ path: DEV_ENV ? '.env.dev' : '.env.prod' });

initDB(process.env.DB_API_KEY as string, "http://localhost:15006/api/v1").then(dbApi => {
    console.log("Database initialized successfully.");
});