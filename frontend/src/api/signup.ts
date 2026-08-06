import axios from "axios";

export interface RegisterResult {
  id: string;
  email: string;
  createdAt: string;
}

export const signup = async (
  email: string,
  password: string
): Promise<RegisterResult> => {
  const response = await axios.post<{ success: boolean; data: RegisterResult }>(
    "http://localhost:3000/auth/register",
    {
      email,
      password,
    }
  );
  return response.data.data;
};
