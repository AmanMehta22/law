import { Link } from "react-router-dom";
import Login from "./Login";
import SignUp from "./SignUp";

function Home(){
    return (
        <div>
            <h1>Law bot</h1>
            <Link to="/login">
                <button>Login</button>
            </Link>
            <Link to="/SignUp">
                <button>SignUp</button>
            </Link>
        </div>
    )   
}
export default Home;