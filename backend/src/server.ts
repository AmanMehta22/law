import app from "./app";
import { env, logger } from "./config";

app.listen(env.PORT, () => {
  logger.info(`Server running on port ${env.PORT}`);
});
