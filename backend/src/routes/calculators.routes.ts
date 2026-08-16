import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import { calculatorsController } from "../controllers/calculators.controller";
import {
  limitationSchema,
  jurisdictionSchema,
} from "../validators/calculators.validator";

const router = Router();

router.use(authMiddleware);

router.post(
  "/limitation",
  validate(limitationSchema),
  calculatorsController.calculateLimitation,
);

router.post(
  "/jurisdiction",
  validate(jurisdictionSchema),
  calculatorsController.calculateJurisdiction,
);

export default router;