import { NextFunction, Request, Response } from "express";
import { authService } from "../services/auth.service";
import { asyncHandler } from "../utils/asyncHandler";

class AuthController {
  register = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const { email, password } = req.body;

      const user = await authService.register(email, password);

      res.status(201).json({
        success: true,
        data: user,
      });
    },
  );

  login = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const { email, password } = req.body;
      const result = await authService.login(email, password);

      res.status(200).json({
        success: true,
        data: result,
      });
    },
  );

  // Lets the frontend verify a persisted token on startup instead of
  // discovering it is expired via failed requests.
  me = asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      data: {
        id: req.user.sub,
        email: req.user.email,
      },
    });
  });
}

export const authController = new AuthController();
