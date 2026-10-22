import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { authorize } from '../../middlewares/authorize.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { AppError } from '../../utils/errors.js';
import { MENU, usersController as c } from './users.controller.js';

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/** Upload satu file .xlsx di field "file" (memori, maks 2 MB) */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (/\.xlsx$/i.test(file.originalname)) return cb(null, true);
    cb(new AppError(400, 'VALIDATION_ERROR', 'File harus berformat .xlsx', [{ field: 'file', message: 'File harus berformat .xlsx' }]));
  },
}).single('file');

function uploadXlsx(req: Request, res: Response, next: NextFunction) {
  upload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Ukuran file maksimal 2 MB' : 'Upload file gagal';
      return next(new AppError(400, 'VALIDATION_ERROR', message, [{ field: 'file', message }]));
    }
    next(err);
  });
}

/** /api/v1/users – permission sesuai PRD §9.2 */
export const usersRouter = Router();

// Route statis didaftarkan sebelum /:id (API-07.12)
usersRouter.get('/export', authorize(MENU, 'EXPORT_EXCEL'), asyncHandler(c.export));
usersRouter.get('/import/template', authorize(MENU, 'IMPORT_EXCEL'), asyncHandler(c.importTemplate));
usersRouter.post('/import', authorize(MENU, 'IMPORT_EXCEL'), uploadXlsx, asyncHandler(c.import));

usersRouter.get('/', authorize(MENU, 'READ'), asyncHandler(c.list));
usersRouter.get('/:id', authorize(MENU, 'READ'), asyncHandler(c.get));
usersRouter.get('/:id/memberships', authorize(MENU, 'READ'), asyncHandler(c.memberships));
usersRouter.post('/', authorize(MENU, 'CREATE'), asyncHandler(c.create));
usersRouter.put('/:id', authorize(MENU, 'UPDATE'), asyncHandler(c.update));
usersRouter.patch('/:id/status', authorize(MENU, 'UPDATE'), asyncHandler(c.setStatus));
usersRouter.post('/:id/restore', authorize(MENU, 'UPDATE'), asyncHandler(c.restore));
usersRouter.post('/:id/reset-password', authorize(MENU, 'UPDATE'), asyncHandler(c.resetPassword));
usersRouter.post('/:id/lock', authorize(MENU, 'UPDATE'), asyncHandler(c.lock));
usersRouter.post('/:id/unlock', authorize(MENU, 'UPDATE'), asyncHandler(c.unlock));
usersRouter.delete('/:id', authorize(MENU, 'DELETE'), asyncHandler(c.remove));
