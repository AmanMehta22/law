import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { conversationController } from "../controllers/conversation.controller";

const router = Router();

router.use(authMiddleware);

router.get("/", conversationController.getConversations);

router.get("/:id", conversationController.getConversation);

router.patch("/:id", conversationController.renameConversation);

router.delete("/:id", conversationController.deleteConversation);

// Temporary - remove later
router.post("/", conversationController.createConversation);

export default router;
