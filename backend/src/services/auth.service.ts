import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { userRepository } from "../repositories/user.repository";
import { ConflictError } from "../errors/ConflictError";
import { AuthenticationError } from "../errors/AuthenticationError";
import { jwtService } from "./jwt.service";
// Pre-computed hash of a throwaway value. Compared against when the email
// does not exist so login takes the same time whether or not the account
// exists, preventing user enumeration via response timing.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("timing-equalizer", 10);

class AuthService {
  async register(email: string, password: string) {
    const passHash = await bcrypt.hash(password, 10);

    try {
      // Create first and rely on the unique constraint instead of a
      // check-then-create, which races between concurrent signups and
      // produced an unhandled P2002 (500) under load.
      const user = await userRepository.createUser(email, passHash);

      return {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictError("An account with this email already exists");
      }

      throw error;
    }
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
