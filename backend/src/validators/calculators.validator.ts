import { z } from "zod";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

export const limitationSchema = z.object({
  causeOfActionDate: dateSchema,
});

export const jurisdictionSchema = z.object({
  claimValue: z
    .number()
    .positive("Claim value must be greater than zero"),
});