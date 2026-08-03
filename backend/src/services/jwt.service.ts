import jwt from "jsonwebtoken";
import { env } from "../config";

export interface JwtPayload {
  sub: string;
  email: string;
}

class JwtService {
  generateToken(userId: string, email: string) {
    return jwt.sign(
      {
        sub: userId,
        email,
      },
      env.JWT_SECRET,
      {
        expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
      },
    );
  }

  verifyToken(token: string): JwtPayload {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  }
}

export const jwtService = new JwtService();
