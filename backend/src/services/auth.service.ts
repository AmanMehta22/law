import bcrypt from "bcrypt";
import { userRepository } from "../repositories/user.repository";
import { ConflictError } from "../errors/ConflictError";
import { AuthenticationError } from "../errors/AuthenticationError";
import { jwtService } from "./jwt.service";

// Pre-computed hash of a throwaway value. Compared against when the email
// does not exist so login takes the same time whether or not the account
// exists, preventing user enumeration via response timing.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("timing-equalizer", 10);

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

    // Always run bcrypt, even for unknown emails, so the two paths take
    // indistinguishable time.
    const isPasswordValid = await bcrypt.compare(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !isPasswordValid) {
      throw new AuthenticationError("Invalid email or password");
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
