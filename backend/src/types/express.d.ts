import { JwtPayload } from "../services/jwt.service";

declare global {
  namespace Express {
    interface Request {
      user: JwtPayload;
      services?: string[];
      requestId?: string;
    }
  }
}

export {};
