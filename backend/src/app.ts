import express from "express";
import cors from "cors";
import helmet from "helmet";

import { errorMiddleware } from "./middleware/error.middleware";
import healthRoutes from "./routes/health.routes";
import authRoutes from "./routes/auth.routes";
import conversationRoutes from "./routes/conversation.routes";
import messageRoutes from "./routes/message.routes";
import calculatorsRoutes from "./routes/calculators.routes";
import intakeRoutes from "./routes/intake.routes";
import documentsRoutes from "./routes/documents.routes";
// import testRoutes from "./routes/test.routes";

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());

app.use("/health", healthRoutes);
app.use("/auth", authRoutes);
app.use("/conversations", conversationRoutes);
app.use("/messages", messageRoutes);
app.use("/calculators", calculatorsRoutes);
app.use("/intake", intakeRoutes);
app.use("/documents", documentsRoutes);
// app.use("/test", testRoutes);
app.use(errorMiddleware);
export default app;
