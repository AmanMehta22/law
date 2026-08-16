import { NextFunction, Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { calculatorsService } from "../services/calculators.service";

class CalculatorsController {
  calculateLimitation = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const { causeOfActionDate } = req.body;

      const result = calculatorsService.calculateLimitation(
        causeOfActionDate,
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    },
  );

  calculateJurisdiction = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const { claimValue } = req.body;

      const result = calculatorsService.calculateJurisdiction(claimValue);

      res.status(200).json({
        success: true,
        data: result,
      });
    },
  );
}

export const calculatorsController = new CalculatorsController();