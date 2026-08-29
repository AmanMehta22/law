import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { healthService } from "../services/health.service";

class HealthController {
  getHealthController = asyncHandler(async (req: Request, res: Response) => {
    const health = await healthService.getHealthStatus();

    res.status(200).json(health);
  });
}

export const healthController = new HealthController();
