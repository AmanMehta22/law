const API_URL = import.meta.env.VITE_API_BASE_URL;

export async function sendMessage(
  conversationId: string | null,
  message: string
) {
  try {
    const token = localStorage.getItem("legalbot_token");

    const response = await fetch(`${API_URL}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        conversationId,
        message,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to send message");
    }

    return data;
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
}
