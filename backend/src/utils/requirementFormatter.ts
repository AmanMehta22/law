import { RequiredField } from "../types/domain.types";

export function formatRequirements(requirements: RequiredField[]) {
  return JSON.stringify(requirements, null, 2);
}
