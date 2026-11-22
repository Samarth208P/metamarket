import type { NextFunction, Request, RequestHandler, Response } from "express";
import { withSystem } from "../database.ts";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: { error: string; [key: string]: unknown },
  ) {
    super(body.error);
  }
}

export function transactionRoute(
  handler: (req: Request) => Promise<unknown>,
): RequestHandler {
  return asyncRoute(async (req, res) => {
    const payload = await withSystem(() => handler(req));
    res.json(payload);
  });
}

export function asyncRoute(
  handler: (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}
