// src/Auth.js
import { useState } from "react";
import { auth } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from "firebase/auth";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState(""); // <-- new field
  const [mode, setMode] = useState("login"); // "login" or "signup"

  const signup = async () => {
    try {
      if (!name.trim()) {
        alert("Please enter a display name");
        return;
      }
      const res = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(res.user, { displayName: name }); // <-- save name to Firebase
    } catch (err) {
      alert(err.message);
    }
  };

  const login = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <main className="container authPage">

      <header className="appHeader">
        <h1 className="title">The Radar</h1>
        <div className="accent" />
        <p className="tagline">
          {mode === "login" ? "Log in to continue" : "Create your radar account"}
        </p>
      </header>

      <section className="glass authBox">
        {mode === "signup" && (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Display name"
          />
        )}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
        />
        <input
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder="Password (min 6 chars)"
        />

        {mode === "login" ? (
          <>
            <button className="btn primary" onClick={login}>Log In</button>
            <p className="switchMode">
              No account?{" "}
              <span className="link" onClick={() => setMode("signup")}>
                Sign up
              </span>
            </p>
          </>
        ) : (
          <>
            <button className="btn primary" onClick={signup}>Create Account</button>
            <p className="switchMode">
              Already have one?{" "}
              <span className="link" onClick={() => setMode("login")}>
                Log in
              </span>
            </p>
          </>
        )}
      </section>
    </main>
  );
}
