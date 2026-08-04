import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { conversationController } from "../controllers/conversation.controller";

const router = Router();

router.post("/", authMiddleware, conversationController.createConversation);

export default router;
