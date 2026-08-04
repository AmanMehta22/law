import express from "express";
import cors from "cors";
import helmet from "helmet";

import { errorMiddleware } from "./middleware/error.middleware";
import healthRoutes from "./routes/health.routes";
import authRoutes from "./routes/auth.routes";
import conversationRoutes from "./routes/conversation.routes";
import messageRoutes from "./routes/message.routes";
const app = express();

app.use(cors());
app.use(helmet());
app.use(errorMiddleware);
app.use(express.json());

app.use("/health", healthRoutes);
app.use("/auth", authRoutes);
app.use("/conversations", conversationRoutes);
app.use("/messages", messageRoutes);
export default app;
