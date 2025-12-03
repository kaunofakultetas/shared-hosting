'use client';
import { useState, useEffect, useRef } from "react";
import axios from "axios";
import BouncingDotsLoader from './components/BouncingDotsLoader/BouncingDotsLoader';
import Particles from './components/Particles/Particles';
import { TextField } from "@mui/material";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Image from 'next/image';



function LoginForm({ selectedForm, setSelectedForm, handleLogin, errorBoxText }) {
  const [loggingIn, setLoggingIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
      <Image alt="VU KnF Logo" src="/img/vuknflogo.png" width={330} height={192} priority />
      
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

      {errorBoxText && (
        <div className="text-xs text-red-500 text-center whitespace-pre-wrap mb-2">
          {errorBoxText}
        </div>
      )}
      
      {loggingIn ? (
        <button 
          disabled 
          className="bg-gray-400 text-white py-2.5 px-4 rounded font-medium cursor-not-allowed flex items-center justify-center gap-2"
        >
          PLEASE WAIT <BouncingDotsLoader />
        </button>
      ) : (
        <button 
          type="button"
          onClick={() => handleLogin(email, password)} 
          className="bg-[#7b003f] hover:bg-[#E64164] text-white py-2.5 px-4 rounded font-medium transition-colors cursor-pointer border-none"
        >
          LOGIN
        </button>
      )}

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




function RegisterForm({ selectedForm, setSelectedForm }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorBoxText, setErrorBoxText] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  
  const [registrationCode, setRegistrationCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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
      
      {isSubmitting ? (
        <button 
          disabled 
          className="bg-gray-400 text-white py-2.5 px-4 rounded font-medium cursor-not-allowed flex items-center justify-center gap-2"
        >
          REGISTERING <BouncingDotsLoader />
        </button>
      ) : (
        <button 
          type="button"
          className="bg-[#7b003f] hover:bg-[#E64164] text-white py-2.5 px-4 rounded font-medium transition-colors cursor-pointer border-none"
          onClick={handleRegister}
        >
          REGISTER
        </button>
      )}

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




export default function Login({ deleteTokens }) {
  const deleteTokensRef = useRef(deleteTokens);
  
  useEffect(() => {
    deleteTokensRef.current = deleteTokens;
  });
  
  useEffect(() => {
    deleteTokensRef.current();
  }, []);

  const [selectedForm, setSelectedForm] = useState(0);
  const [loginErrorBoxText, setLoginErrorBoxText] = useState("");

  const handleLogin = async (email, password) => {
    try {
      const response = await axios.post("/api/login", { email, password });
      if (response.data === "OK") {
        window.location.href = "/";
      } else {
        setLoginErrorBoxText(response.data);
      }
    } catch (error) {
      setLoginErrorBoxText("Login failed");
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

      {/* Main content - centered */}
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
