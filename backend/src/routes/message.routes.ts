import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import { messageController } from "../controllers/message.controller";
import { sendMessageSchema } from "../validators/message.validator";

const router = Router();

router.post(
  "/",
  authMiddleware,
  validate(sendMessageSchema),
  messageController.sendMessage,
);

export default router;
