import axios from "axios";

export interface AuthResult {
  accessToken: string;
  user: {
    id: string;
    email: string;
  };
}

export const loginUser = async (
  email: string,
  password: string
): Promise<AuthResult> => {
  const response = await axios.post<{ success: boolean; data: AuthResult }>(
    `${import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"}/auth/login`,
    {
      email,
      password,
    }
  );
  return response.data.data;
};
