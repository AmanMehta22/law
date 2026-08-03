import { Request, Response } from "express";
import { healthService } from "../services/health.service";

class HealthController {
  getHealthController(req: Request, res: Response) {
    const health = healthService.getHealthStatus();

    res.status(200).json(health);
  }
}

export const healthController = new HealthController();
