import jwt from "jsonwebtoken";
import { env } from "../config";

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

  verifyToken(token: string) {
    return jwt.verify(token, env.JWT_SECRET);
  }
}

export const jwtService = new JwtService();
