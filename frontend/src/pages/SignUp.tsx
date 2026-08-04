import React, { useState } from "react";
import { registerUser } from "../api_test/register";

function SignUp(){
    
    const [email,setemail]=useState("");
    const [password,setpassword]=useState("");

    const handleSubmit=async(e:React.FormEvent)=>{
        e.preventDefault();
        
        try{
            const data=await registerUser(email,password);
            console.log("User registration successful : ",data)
        }
        catch(error){
            console.log("Registration not completed : ",error)
        }
    }
    
    return (
        <div>
            <h1>SignUp</h1>
            <form onSubmit={handleSubmit}>
                <div>
                    <p>email</p>
                    <input type="text" name="email" value={email} onChange={(e)=>setemail(e.target.value)} />
                </div>
                <div>
                    <p>Password</p>
                    <input type="text" name="password"value={password} onChange={(e)=>setpassword(e.target.value)}/>
                </div>
                <button type="submit">SignUp</button>
            </form>
        </div>
    )
}
export default SignUp;