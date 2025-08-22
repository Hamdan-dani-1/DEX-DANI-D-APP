import { useState } from "react";
import "./App.css";
import Login from "./components/pages/login";
import Sign from "./components/pages/signup";
import Dashboard from "./components/pages/dashboard";
import SolTransfer from "./components/pages/transfersol";
import Swap from "./components/pages/swap"
import Abot from "./components/arbitagebot/bot"
import { BrowserRouter, Route, Link, Routes, useLocation } from "react-router";

// Navigation component
function Navigation() {
  const location = useLocation();
  
  // Don't show navbar on login and signup pages
  if (location.pathname === '/login' || location.pathname === '/signup') {
    return null;
  }
  
  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="logo">DEX-DANI</Link>
        <div className="nav-buttons">
     
        </div>
      </div>
    </nav>
  );
}

// Welcome/Home component
function Home() {
  return (
    <div className="app-container">
      {/* Floating Particles */}
      <div className="particles">
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
      </div>

      {/* Glowing Orbs */}
      <div className="glow-orb orb-1"></div>
      <div className="glow-orb orb-2"></div>
      <div className="glow-orb orb-3"></div>

      {/* Welcome Section */}
      <div className="welcome-section">
        <div className="welcome-content">
          <h1 className="welcome-title">
            Welcome to <span className="dex-highlight">DEX-DANI</span>
          </h1>
          <p className="welcome-subtitle">
            Experience the future of decentralized exchange services
          </p>
          <p className="welcome-subtitle">
            🚀 Trade • 💰 Transfer • 📊 Analytics • 🔒 Secure
          </p>
               <Link to="/login" className="nav-button login-btn">Login</Link>
          <Link to="/signup" className="nav-button signup-btn">Sign Up</Link>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
      
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Sign />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/soltransfer" element={<SolTransfer />} />
        <Route path="/swap" element={<Swap />} />
        <Route path="/bot" element={<Abot />} />
      </Routes>
  );
}

export default App;