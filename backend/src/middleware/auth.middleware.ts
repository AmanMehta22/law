import { NextFunction, Request, Response } from "express";
import { jwtService } from "../services/jwt.service";
import { AuthenticationError } from "../errors/AuthenticationError";

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new AuthenticationError("Missing authorization header");
    }

    if (!authHeader.startsWith("Bearer ")) {
      throw new AuthenticationError("Invalid authorization header");
    }

    const token = authHeader.split(" ")[1];

    const payload = jwtService.verifyToken(token);

    req.user = payload;

    next();
  } catch (error) {
    next(error);
  }
};
