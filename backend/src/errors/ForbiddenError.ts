import { AppError } from "./AppError";

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource") {
    super(message, 403);
  }
}
