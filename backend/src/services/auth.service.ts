import bcrypt from "bcrypt";
import { userRepository } from "../repositories/user.repository";
import { ConflictError } from "../errors/ConflictError";
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
}

export const authService = new AuthService();
