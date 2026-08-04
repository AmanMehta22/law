import axios from "axios";

export const loginUser=async(
    email:string,
    password:string
)=>{
    const response=await axios.post(
        "http://localhost:3000/auth/login",
        {
            email,
            password
        }
    )
    return response.data;
}