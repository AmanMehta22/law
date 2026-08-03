import express from "express";
import cors from "cors";
import helmet from "helmet";

import healthRoutes from "./routes/health.routes";

const app = express();

app.use(cors());
app.use(helmet());

app.use(express.json());

// app.get("/health", (_, res) => {
//   res.status(200).json({
//     status: "ok",
//   });
// });

app.use("/health", healthRoutes);

export default app;
