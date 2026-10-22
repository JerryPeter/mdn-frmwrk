import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { authenticate } from './middlewares/auth.js';
import { requireApplication } from './middlewares/authorize.js';
import { errorHandler, notFoundHandler } from './middlewares/error.js';
import { actionsRouter } from './modules/actions/actions.routes.js';
import { applicationsRouter } from './modules/applications/applications.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { companiesRouter } from './modules/companies/companies.routes.js';
import { companyApplicationsRouter } from './modules/company-applications/company-applications.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { lookupsRouter } from './modules/lookups/lookups.routes.js';
import { menuTreeRouter, menusRouter } from './modules/menus/menus.routes.js';
import { userGroupsRouter } from './modules/user-groups/user-groups.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()), credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use('/health', healthRouter);
  api.use('/auth', authRouter);

  // Master & pemetaan: wajib login + konteks aktif aplikasi USRMGNT (PRD §9.2)
  const usrmgnt = [authenticate(), requireApplication('USRMGNT')];
  api.use('/companies', ...usrmgnt, companyApplicationsRouter, companiesRouter);
  api.use('/applications', ...usrmgnt, menuTreeRouter, applicationsRouter);
  api.use('/actions', ...usrmgnt, actionsRouter);
  api.use('/menus', ...usrmgnt, menusRouter);
  api.use('/users', ...usrmgnt, usersRouter);
  api.use('/user-groups', ...usrmgnt, userGroupsRouter);
  api.use('/lookups', ...usrmgnt, lookupsRouter);

  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
