import { useEffect, useRef } from "react";

const GOOGLE_CLIENT_ID =
  "277143872615-coqt80r9nkb1okfefj6bvtvn8mdfou17.apps.googleusercontent.com";

const BACKEND_URL =
  "https://script.google.com/macros/s/AKfycbxpJ7bm8l-WmKg0oBX2DVgR8kU8DxlwtooJbBxpINkf3mqiEv0mQbySJcz5jWhc1SYpDw/exec";

function Login({ onLogin }) {
  const googleButtonRef = useRef(null);
  const initializedRef = useRef(false);
  const scriptRef = useRef(null);

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

    const existingScript =
      document.querySelector(
        'script[src="https://accounts.google.com/gsi/client"]'
      );

    if (existingScript) {
      existingScript.addEventListener(
        "load",
        initializeGoogle
      );

      scriptRef.current = existingScript;

      return () => {
        existingScript.removeEventListener(
          "load",
          initializeGoogle
        );
      };
    }

    const script =
      document.createElement("script");

    script.src =
      "https://accounts.google.com/gsi/client";

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

      const formData =
        new URLSearchParams();

      formData.append(
        "action",
        "googleLogin"
      );

      formData.append(
        "credential",
        response.credential
      );

      const backendResponse =
        await fetch(
          BACKEND_URL,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded;charset=UTF-8",
            },
            body:
              formData.toString(),
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
        data =
          JSON.parse(rawResponse);
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

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-logo">
          🌱
        </div>

        <h1>
          Welcome to grassAI
        </h1>

        <p>
          Sign in to continue.
        </p>

        <div
          ref={googleButtonRef}
          className="google-button-container"
        />

        <div className="login-divider">
          <span>or</span>
        </div>

        <input
          type="email"
          placeholder="Email"
        />

        <input
          type="password"
          placeholder="Password"
        />

        <button className="login-button">
          Sign In
        </button>

        <p className="signup-text">
          Don't have an account?{" "}
          <button>
            Sign Up
          </button>
        </p>
      </div>
    </main>
  );
}

export default Login;