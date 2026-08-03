import bcrypt from "bcrypt";
import { userRepository } from "../repositories/user.repository";
import { ConflictError } from "../errors/ConflictError";
import { jwtService } from "./jwt.service";
import { bytes } from "node:stream/consumers";

class AuthService {
  async register(email: string, passowrd: string) {
    const existingUser = await userRepository.findByEmail(email);

    if (existingUser) {
      throw new ConflictError("user already present");
    }

    const passHash = await bcrypt.hash(passowrd, 10);

    const user = userRepository.createUser(email, passHash);

    return {
      id: (await user).id,
      email: (await user).email,
      createdAt: (await user).createdAt,
    };
  }

  async login(email: string, password: string) {
    const user = await userRepository.findByEmail(email);

    if (!user) {
      throw new Error("Invalid email or password");
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new Error("Invalid email or password");
    }

    const accessToken = jwtService.generateToken(user.id, user.email);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
      },
    };
  }
}

export const authService = new AuthService();
