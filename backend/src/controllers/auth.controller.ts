import { NextFunction, Request, Response } from "express";
import { authService } from "../services/auth.service";

class AuthController {
  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;

      const user = await authService.register(email, password);

      res.status(201).json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const authController = new AuthController();
