import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { documentsController } from "../controllers/documents.controller";

const router = Router();

router.use(authMiddleware);

router.get("/templates", documentsController.getTemplates);

export default router;