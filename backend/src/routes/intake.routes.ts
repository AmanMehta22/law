import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { intakeController } from "../controllers/intake.controller";

const router = Router();

router.use(authMiddleware);

router.get("/requirements", intakeController.getRequirements);

export default router;