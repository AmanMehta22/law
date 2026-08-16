import { NextFunction, Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { CONSUMER_INFORMATION_REQUIREMENTS } from "../knowledge/consumer/consumer.fields";

class IntakeController {
  getRequirements = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      res.status(200).json({
        success: true,
        data: CONSUMER_INFORMATION_REQUIREMENTS,
      });
    },
  );
}

export const intakeController = new IntakeController();