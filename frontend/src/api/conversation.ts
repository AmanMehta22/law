const API_URL=import.meta.env.VITE_API_BASE_URL;

export async function createConversation(){
    const token=localStorage.getItem("legalbot_token");

    const response=await fetch(`${API_URL}/conversations`,{
        method:"POST",
        headers:{
            Authorization:`Bearer ${token}`,
            "Content-Type":"application/json",
        },
    });

    const data=await response.json();

    if(!response.ok){
        throw new Error(data.message||"Failed to create conversation");
    }
    return data;
}