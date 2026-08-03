import express from "express";
import cors from "cors";
import helmet from "helmet";

import healthRoutes from "./routes/health.routes";
import authRoutes from "./routes/auth.routes";
import { errorMiddleware } from "./middleware/error.middleware";
const app = express();

app.use(cors());
app.use(helmet());
app.use(errorMiddleware);
app.use(express.json());

app.use("/health", healthRoutes);
app.use("/auth", authRoutes);

export default app;
