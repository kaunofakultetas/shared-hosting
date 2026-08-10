// -----------------------------------------------------------
//  [*] Public — Login page
//
//  The entry point of the app: a white card on the animated
//  particles background, gradient backdrop behind it. Two
//  forms live here — sign-in (default) and student
//  self-registration by admin-issued code — both stay mounted
//  and toggle visibility, so switching keeps the typed input.
//
//  Opening /login also acts as logout: the page POSTs
//  /api/logout on mount, which flushes the session and
//  expires the HttpOnly cookie (JavaScript cannot touch it
//  directly). After a successful login the page
//  hard-navigates to "/" and HomeRedirect sends the user to
//  their home by role.
//
//  This page renders bare — App skips every provider on
//  /login (a failed auth check would hard-redirect here and
//  loop), so no i18n either: the strings stay hardcoded
//  English, the app's default locale.
//
//  Split into (root component last):
//
//    BrandSubmitButton — burgundy submit / grey busy button
//    LoginForm         — email + password sign-in (default)
//    RegisterForm      — registration-code sign-up
//    Login             — the page itself (default export)
// -----------------------------------------------------------

import { useState, useEffect } from "react";
import axios from "axios";
import { TextField } from "@mui/material";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

import BouncingDotsLoader from './components/BouncingDotsLoader/BouncingDotsLoader';
import Particles from './components/Particles/Particles';


// The backend answers login failures with machine codes and
// real status codes — this page maps them to its wording
// (hardcoded English like everything else on /login)
const LOGIN_ERROR_MESSAGES = {
  MISSING_CREDENTIALS: 'Enter your email address and password.',
  MISSING_EMAIL: 'Enter your email address.',
  MISSING_PASSWORD: 'Enter your password.',
  INVALID_CREDENTIALS: 'Email and/or password is incorrect.',
};







// -----------------------------------------------------------
// BrandSubmitButton
// -----------------------------------------------------------
//
// The burgundy full-width submit button; while `busy` it
// turns grey with the bouncing-dots loader and stops
// accepting clicks.
//
// Used by:
//   - LoginForm, RegisterForm (below)
// -----------------------------------------------------------

function BrandSubmitButton({ busy, busyLabel, label, onClick }) {

  if (busy) {
    return (
      <button
        disabled
        className="bg-gray-400 text-white py-2.5 px-4 rounded font-medium cursor-not-allowed flex items-center justify-center gap-2"
      >
        {busyLabel} <BouncingDotsLoader />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-[#7b003f] hover:bg-[#E64164] text-white py-2.5 px-4 rounded font-medium transition-colors cursor-pointer border-none"
    >
      {label}
    </button>
  );
}







// -----------------------------------------------------------
// LoginForm
// -----------------------------------------------------------
//
// The sign-in card: logo, app title, email + password. Enter
// submits while this form is the visible one. The actual
// login request lives in the page root (handleLogin), which
// also owns the error text so it survives form switches.
//
// Used by:
//   - Login (below)
// -----------------------------------------------------------

function LoginForm({ selectedForm, setSelectedForm, handleLogin, errorBoxText }) {

  // Never set — the login request has no in-flight state (the
  // register form has the working version), so the busy branch
  // of the submit button is currently unreachable
  const [loggingIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");


  // Enter submits, but only while the sign-in form is visible
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Enter' && selectedForm === 0) {
        handleLogin(email, password);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [email, password, selectedForm, handleLogin]);


  return (
    <form className="w-full max-w-[350px] flex flex-col bg-white p-5 rounded-2xl shadow-2xl">
      <img alt="VU KnF Logo" src="/img/vuknflogo.png" width={330} height={192} />

      <div className="text-center mt-3">
        <h1 className="text-lg font-medium text-gray-700">App Hosting Platform</h1>
      </div>

      <div className="flex flex-col gap-4 mt-4 mb-14">
        <TextField
          required
          variant="standard"
          label="Email"
          onChange={(e) => setEmail(e.currentTarget.value)}
          fullWidth
        />
        <TextField
          required
          variant="standard"
          type="password"
          label="Password"
          onChange={(e) => setPassword(e.currentTarget.value)}
          fullWidth
        />
      </div>

      {/* The backend's error message (hidden when empty) */}
      {errorBoxText && (
        <div className="text-xs text-red-500 text-center whitespace-pre-wrap mb-2">
          {errorBoxText}
        </div>
      )}

      <BrandSubmitButton
        busy={loggingIn}
        busyLabel="PLEASE WAIT"
        label="LOGIN"
        onClick={() => handleLogin(email, password)}
      />

      <button
        type="button"
        className="text-[#7b003f] mt-4 border rounded py-2 px-4 bg-transparent hover:bg-[#E64164] hover:text-white transition-colors cursor-pointer font-medium"
        onClick={() => setSelectedForm(1)}
      >
        Registration
      </button>
    </form>
  );
}







// -----------------------------------------------------------
// RegisterForm
// -----------------------------------------------------------
//
// Student self-registration: admin-issued code (uppercased as
// typed), email and password twice. Validation runs client-
// side first; the backend answer lands in the red error box
// or the green success box, and a success clears the fields
// so the student can go log in.
//
// Used by:
//   - Login (below)
// -----------------------------------------------------------

function RegisterForm({ selectedForm, setSelectedForm }) {

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorBoxText, setErrorBoxText] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [registrationCode, setRegistrationCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");


  // Enter submits, but only while the registration form is
  // the visible one
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Enter' && selectedForm === 1) {
        event.preventDefault();
        handleRegister();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [registrationCode, email, password, confirmPassword, selectedForm]);


  const handleRegister = async () => {
    setErrorBoxText("");
    setSuccessMessage("");

    // Client-side validation
    if (!registrationCode.trim()) {
      setErrorBoxText("Registration code is required");
      return;
    }
    if (!email.trim()) {
      setErrorBoxText("Email is required");
      return;
    }
    if (!password) {
      setErrorBoxText("Password is required");
      return;
    }
    if (password.length < 6) {
      setErrorBoxText("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setErrorBoxText("Passwords do not match");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await axios.post("/api/register", {
        registrationCode: registrationCode.trim().toUpperCase(),
        email: email.trim(),
        password
      });

      if (response.status === 200 || response.status === 201) {
        setSuccessMessage(response.data.message || "Registration successful! You can now login.");
        // Clear form
        setRegistrationCode("");
        setEmail("");
        setPassword("");
        setConfirmPassword("");
      } else {
        setErrorBoxText(response.data.message || "Registration failed");
      }
    } catch (error) {
      setErrorBoxText(error.response?.data?.message || "Registration failed");
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <form className="w-full max-w-[380px] flex flex-col bg-white p-6 rounded-2xl shadow-2xl">
      <button
        type="button"
        className="bg-[#7b003f] hover:bg-[#E64164] text-white w-10 h-10 mb-4 rounded flex items-center justify-center cursor-pointer border-none transition-colors"
        onClick={() => setSelectedForm(0)}
      >
        <ArrowBackIcon />
      </button>

      <h3 className="mb-2 text-xl font-semibold text-gray-800">Create Account</h3>
      <p className="mb-6 text-gray-500 text-sm">
        Enter the registration code provided by your administrator
      </p>

      <div className="flex flex-col gap-4 mb-6">
        <TextField
          required
          variant="standard"
          label="Registration Code"
          value={registrationCode}
          onChange={(e) => setRegistrationCode(e.currentTarget.value.toUpperCase())}
          fullWidth
          inputProps={{
            style: { fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase' }
          }}
          placeholder="XXXXXXXX"
        />
        <TextField
          required
          variant="standard"
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
          fullWidth
        />
        <TextField
          required
          variant="standard"
          type="password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          fullWidth
          helperText="At least 6 characters"
        />
        <TextField
          required
          variant="standard"
          type="password"
          label="Confirm Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.currentTarget.value)}
          fullWidth
        />
      </div>

      {errorBoxText && (
        <div className="text-xs text-red-500 text-center whitespace-pre-wrap mb-3 p-2 bg-red-50 rounded">
          {errorBoxText}
        </div>
      )}

      {successMessage && (
        <div className="text-xs text-green-600 text-center whitespace-pre-wrap mb-3 p-2 bg-green-50 rounded">
          {successMessage}
        </div>
      )}

      <BrandSubmitButton
        busy={isSubmitting}
        busyLabel="REGISTERING"
        label="REGISTER"
        onClick={handleRegister}
      />

      <div className="text-center mt-4 text-sm text-gray-500">
        Already have an account?{' '}
        <button
          type="button"
          className="text-[#7b003f] hover:text-[#E64164] font-medium bg-transparent border-none cursor-pointer underline"
          onClick={() => setSelectedForm(0)}
        >
          Login here
        </button>
      </div>
    </form>
  );
}







// -----------------------------------------------------------
// Login (default export)
// -----------------------------------------------------------
//
// The page itself: drops the session cookie on mount (logout),
// switches between the two forms and does the login call. The
// backend answers "OK" or a display-ready error message; on
// success a full page load restarts the app with the fresh
// session.
//
// Used by:
//   - router.jsx — route /login (rendered without PageWrapper)
// -----------------------------------------------------------

export default function Login() {

  const [selectedForm, setSelectedForm] = useState(0);
  const [loginErrorBoxText, setLoginErrorBoxText] = useState("");


  // Visiting /login logs the user out — flush the session
  // server-side (the cookie is HttpOnly, JS can't clear it)
  useEffect(() => {
    axios.post("/api/logout").catch(() => { /* already signed out */ });
  }, []);


  // A failed login throws (real status codes) — the machine
  // code in the body picks the message
  const handleLogin = async (email, password) => {
    try {
      await axios.post("/api/login", { email, password });
      window.location.href = "/";
    } catch (error) {
      const errorCode = error.response?.data?.message;
      setLoginErrorBoxText(LOGIN_ERROR_MESSAGES[errorCode] ?? "Login failed. Please try again.");
    }
  };


  return (
    <div
      className="min-h-screen w-full flex flex-col relative"
      style={{ backgroundImage: "linear-gradient(to bottom right, #7b4397, #dc2430)" }}
    >
      {/* Particles background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <Particles />
      </div>

      {/* The two forms — both stay mounted, one is visible, so
          switching back keeps whatever was typed */}
      <div className="flex-1 flex items-center justify-center p-4 pb-16 relative z-10">
        <div className={selectedForm === 0 ? 'block' : 'hidden'}>
          <LoginForm
            selectedForm={selectedForm}
            setSelectedForm={setSelectedForm}
            handleLogin={handleLogin}
            errorBoxText={loginErrorBoxText}
          />
        </div>

        <div className={selectedForm === 1 ? 'block' : 'hidden'}>
          <RegisterForm
            selectedForm={selectedForm}
            setSelectedForm={setSelectedForm}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="py-4 text-center relative z-10">
        <div className="text-white text-xs">
          Copyright © | All Rights Reserved | VUKnF
        </div>
      </div>
    </div>
  );
}
