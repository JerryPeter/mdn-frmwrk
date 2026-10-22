import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Express 4 tidak menangkap error dari handler async; teruskan ke error handler */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
