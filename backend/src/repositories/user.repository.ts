import { prisma } from "../config";

class UserRepository {
  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: {
        email,
      },
    });
  }

  async createUser(email: string, passwordHash: string) {
    return prisma.user.create({
      data: {
        email,
        passwordHash,
      },
    });
  }
}

export const userRepository = new UserRepository();
