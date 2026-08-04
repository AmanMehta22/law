import React, { useState } from "react";
import { loginUser } from "../api_test/login";

function Login(){

    const [email,setemail]=useState("");
    const [password,setpassword]=useState("");

    const handleLogin=async(e:React.FormEvent)=>{
        e.preventDefault();

        try{
            const data=await loginUser(email,password);
            console.log("Login successful : ",data);
        }
        catch(error){
            console.log("Login error : ",error);
        }
    }

    return (
        <div>
            <h1> LogIn</h1>
            <form action="" onSubmit={handleLogin}>
                <div>
                    <p>username</p>
                    <input type="text" name="email" placeholder="email" value={email} onChange={(e)=>setemail(e.target.value)}/>
                </div>
                <div>
                    <p>Password</p>
                    <input type="text" name="password" placeholder="password" value={password} onChange={(e)=>setpassword(e.target.value)}/>
                </div>
                <button type="submit">Login</button>
            </form>
        </div>
    )
}
export default Login;