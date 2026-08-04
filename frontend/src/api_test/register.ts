import axios from "axios";
export const registerUser =async(
    email:string,
    password:string
)=>{
    const response=await axios.post(
        "http://localhost:3000/auth/register",
        {
            email,
            password
        }
    );
    return response.data;
}

