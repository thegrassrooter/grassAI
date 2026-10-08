import { useEffect, useRef, useState } from "react";

const GOOGLE_CLIENT_ID =
  "277143872615-coqt80r9nkb1okfefj6bvtvn8mdfou17.apps.googleusercontent.com";

const BACKEND_URL =
  "https://script.google.com/macros/s/AKfycbxpJ7bm8l-WmKg0oBX2DVgR8kU8DxlwtooJbBxpINkf3mqiEv0mQbySJcz5jWhc1SYpDw/exec";

function Login({ onLogin }) {
  const googleButtonRef = useRef(null);
  const initializedRef = useRef(false);
  const scriptRef = useRef(null);

  const [mode, setMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    function initializeGoogle() {
      if (
        initializedRef.current ||
        !window.google ||
        !googleButtonRef.current
      ) {
        return;
      }

      initializedRef.current = true;

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleResponse,
      });

      googleButtonRef.current.innerHTML = "";

      window.google.accounts.id.renderButton(
        googleButtonRef.current,
        {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: 340,
        }
      );
    }

    if (window.google) {
      initializeGoogle();
      return;
    }

    const existingScript = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]'
    );

    if (existingScript) {
      existingScript.addEventListener("load", initializeGoogle);

      scriptRef.current = existingScript;

      return () => {
        existingScript.removeEventListener(
          "load",
          initializeGoogle
        );
      };
    }

    const script = document.createElement("script");

    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogle;

    document.head.appendChild(script);

    scriptRef.current = script;

    return () => {
      script.onload = null;
    };
  }, []);

  async function handleGoogleResponse(response) {
    try {
      if (!response?.credential) {
        throw new Error(
          "Google did not return an ID token."
        );
      }

      const formData = new URLSearchParams();

      formData.append("action", "googleLogin");
      formData.append("credential", response.credential);

      const backendResponse = await fetch(
        BACKEND_URL,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded;charset=UTF-8",
          },
          body: formData.toString(),
        }
      );

      const rawResponse =
        await backendResponse.text();

      if (!backendResponse.ok) {
        throw new Error(
          `Backend HTTP ${backendResponse.status}: ${rawResponse}`
        );
      }

      let data;

      try {
        data = JSON.parse(rawResponse);
      } catch {
        throw new Error(
          "The backend returned an invalid response."
        );
      }

      if (!data.success) {
        throw new Error(
          data.error ||
            "Google login was rejected."
        );
      }

      console.log(
        "grassAI Google user:",
        data.user
      );

      onLogin(
        data.user,
        response.credential
      );
    } catch (error) {
      console.error(
        "Google login error:",
        error
      );

      alert(
        "Google sign-in failed.\n\n" +
          (error.message ||
            "Unknown error.")
      );
    }
  }

  async function handleEmailSubmit(event) {
    event.preventDefault();

    if (loading) return;

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      alert("Please enter your email address.");
      return;
    }

    if (!password) {
      alert("Please enter your password.");
      return;
    }

    if (mode === "signup") {
      if (!name.trim()) {
        alert("Please enter your name.");
        return;
      }

      if (password.length < 8) {
        alert(
          "Your password must be at least 8 characters long."
        );
        return;
      }

      if (password !== confirmPassword) {
        alert("Your passwords do not match.");
        return;
      }
    }

    try {
      setLoading(true);

      const formData = new URLSearchParams();

      formData.append(
        "action",
        mode === "signup"
          ? "emailSignUp"
          : "emailLogin"
      );

      formData.append("email", cleanEmail);
      formData.append("password", password);

      if (mode === "signup") {
        formData.append("name", name.trim());
      }

      const backendResponse = await fetch(
        BACKEND_URL,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded;charset=UTF-8",
          },
          body: formData.toString(),
        }
      );

      const rawResponse =
        await backendResponse.text();

      if (!backendResponse.ok) {
        throw new Error(
          `Backend HTTP ${backendResponse.status}: ${rawResponse}`
        );
      }

      let data;

      try {
        data = JSON.parse(rawResponse);
      } catch {
        throw new Error(
          "The backend returned an invalid response."
        );
      }

      if (!data.success) {
        throw new Error(
          data.error ||
            (mode === "signup"
              ? "Account creation failed."
              : "Sign in failed.")
        );
      }

      console.log(
        "grassAI email user:",
        data.user
      );

      /*
       * The backend should return the user's
       * authentication token here.
       *
       * Google login currently passes the Google
       * credential as the second argument, so
       * email authentication follows the same
       * pattern.
       */
      onLogin(
        data.user,
        data.token
      );
    } catch (error) {
      console.error(
        "Email authentication error:",
        error
      );

      alert(
        (mode === "signup"
          ? "Account creation failed."
          : "Sign in failed.") +
          "\n\n" +
          (error.message ||
            "Unknown error.")
      );
    } finally {
      setLoading(false);
    }
  }

  function switchMode(newMode) {
    setMode(newMode);
    setPassword("");
    setConfirmPassword("");
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-logo">
          🌱
        </div>

        <h1>
          {mode === "signup"
            ? "Create your grassAI account"
            : "Welcome to grassAI"}
        </h1>

        <p>
          {mode === "signup"
            ? "Create an account to get started."
            : "Sign in to continue."}
        </p>

        <div
          ref={googleButtonRef}
          className="google-button-container"
        />

        <div className="login-divider">
          <span>or</span>
        </div>

        <form onSubmit={handleEmailSubmit}>
          {mode === "signup" && (
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              autoComplete="name"
              disabled={loading}
            />
          )}

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            autoComplete="email"
            disabled={loading}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            autoComplete={
              mode === "signup"
                ? "new-password"
                : "current-password"
            }
            disabled={loading}
          />

          {mode === "signup" && (
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(event) =>
                setConfirmPassword(
                  event.target.value
                )
              }
              autoComplete="new-password"
              disabled={loading}
            />
          )}

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading
              ? mode === "signup"
                ? "Creating Account..."
                : "Signing In..."
              : mode === "signup"
                ? "Create Account"
                : "Sign In"}
          </button>
        </form>

        <p className="signup-text">
          {mode === "signin"
            ? "Don't have an account? "
            : "Already have an account? "}

          <button
            type="button"
            onClick={() =>
              switchMode(
                mode === "signin"
                  ? "signup"
                  : "signin"
              )
            }
            disabled={loading}
          >
            {mode === "signin"
              ? "Sign Up"
              : "Sign In"}
          </button>
        </p>
      </div>
    </main>
  );
}

export default Login;