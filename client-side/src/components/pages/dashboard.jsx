import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import SolTransfer from "./transfersol";
import { User, Wallet, Send, Home, ArrowLeft, Bot, Activity } from "lucide-react";
import "./dashboard.css"; // Import the CSS file

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { userInfo, wallet } = location.state || {};
  
  const { name, email, address, balance } = userInfo || {};
  
  const [currentView, setCurrentView] = useState('dashboard');

  if (!userInfo || !name) {
    return (
      <div className="dashboard-container">
        <div className="access-denied-card">
          <h1 className="access-denied-title">Access Denied</h1>
          <p className="access-denied-message">No user data found. Please log in again.</p>
          <Link to="/login" className="login-link">
            <ArrowLeft className="icon-small" />
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  const userData = {
    name,
    email,
    address,
    balance,
    wallet
  };

  const handleSolTransferNavigation = () => {
    navigate('/soltransfer', { 
      state: { 
        userData: userData,
        userInfo: userInfo,
        wallet: wallet?.toString() 
      } 
    });
  };

  const handleSwapNavigation = () => {
    navigate('/swap', { 
      state: { 
        userData: userData,
        userInfo: userInfo,
        wallet: wallet?.toString() 
      } 
    });
  };

  const handleArbitgateNavigation = () => {
    navigate('/bot', { 
      state: { 
        userData: userData,
        userInfo: userInfo,
        wallet: wallet?.toString() 
      } 
    });
  };

  if (currentView === 'transfer') {
    return (
      <div>
        <div className="navigation-back">
          <button
            onClick={() => setCurrentView('dashboard')}
            className="back-button"
          >
            <ArrowLeft className="icon-small" />
            Back to Dashboard
          </button>
        </div>
        
        <SolTransfer userData={userData} userInfo={userInfo} />
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-content">
        {/* Header */}
        <div className="dashboard-header">
          <div className="header-icon">
            <Home className="icon-large" />
          </div>
          <h1 className="dashboard-title">Dashboard</h1>
          <p className="dashboard-subtitle">Welcome back, {name}!</p>
        </div>

        {/* User Info Card */}
        <div className="info-card">
          <div className="info-grid">
            {/* User Details */}
            <div className="info-section">
              <h2 className="section-title">
                <User className="icon-medium" />
                Account Information
              </h2>
              
              <div className="info-list">
                <div className="info-item">
                  <span className="info-label">Name:</span>
                  <span className="info-value">{name}</span>
                </div>
                
                <div className="info-item">
                  <span className="info-label">Email:</span>
                  <span className="info-value">{email}</span>
                </div>
                
                <div className="info-item">
                  <span className="info-label">Balance:</span>
                  <span className="balance-value">{balance} SOL</span>
                </div>
              </div>
            </div>

            {/* Wallet Details */}
            <div className="info-section">
              <h2 className="section-title">
                <Wallet className="icon-medium" />
                Wallet Details
              </h2>
              
              <div className="wallet-details">
                <div className="wallet-item">
                  <span className="wallet-label">Account Address:</span>
                  <div className="wallet-address">{address}</div>
                </div>
                
                <div className="wallet-item">
                  <span className="wallet-label">Connected Wallet:</span>
                  <div className="wallet-address">{wallet}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Cards */}
        <div className="action-cards">
          {/* Send SOL Card */}
          <div className="action-card send-card">
            <div className="action-icon send-icon">
              <Send className="icon-medium" />
            </div>
            <h3 className="action-title">Send SOL</h3>
            <p className="action-description">Transfer SOL to other accounts securely</p>
            <button
              onClick={handleSolTransferNavigation}
              className="action-button send-button"
            >
              Transfer Now
            </button>
          </div>

          {/* Swap Card */}
          <div className="action-card swap-card">
            <div className="action-icon swap-icon">
              <Wallet className="icon-medium" />
            </div>
            <h3 className="action-title">Swap Tokens</h3>
            <p className="action-description">Exchange SOL for other tokens</p>
            <button
              onClick={handleSwapNavigation}
              className="action-button swap-button"
            >
              Swap Now
            </button>
          </div>

          {/* ArbitGate Bot Card */}
          <div className="action-card bot-card">
            <div className="action-icon bot-icon">
              <Bot className="icon-medium" />
            </div>
            <h3 className="action-title">ArbitGate Bot</h3>
            <p className="action-description">Automated arbitrage trading bot</p>
            <button
              onClick={handleArbitgateNavigation}
              className="action-button bot-button"
            >
              Launch Bot
            </button>
          </div>

          {/* Balance Card */}
          <div className="action-card">
            <div className="action-icon balance-icon">
              <Wallet className="icon-medium" />
            </div>
            <h3 className="action-title">Current Balance</h3>
            <p className="balance-amount">{balance} SOL</p>
            <p className="action-description">Available for transfers</p>
          </div>

          {/* Account Status Card */}
          <div className="action-card">
            <div className="action-icon status-icon">
              <User className="icon-medium" />
            </div>
            <h3 className="action-title">Account Status</h3>
            <div className="status-indicator">
              <div className="status-dot"></div>
              <span className="status-text">Active</span>
            </div>
            <p className="action-description">Account verified and ready</p>
          </div>

          {/* Bot Status Card */}
          <div className="action-card">
            <div className="action-icon activity-icon">
              <Activity className="icon-medium" />
            </div>
            <h3 className="action-title">Bot Status</h3>
            <div className="status-indicator">
              <div className="status-dot bot-status-dot"></div>
              <span className="status-text">Ready</span>
            </div>
            <p className="action-description">ArbitGate bot ready to deploy</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="quick-actions">
          <div className="quick-actions-card">
            <h3 className="quick-actions-title">Quick Actions</h3>
            <div className="quick-buttons">
              <button
                onClick={handleSolTransferNavigation}
                className="quick-button send-quick-button"
              >
                <Send className="icon-small" />
                Send SOL
              </button>
              
              <button
                onClick={handleSwapNavigation}
                className="quick-button swap-quick-button"
              >
                <Wallet className="icon-small" />
                Swap
              </button>

              <button
                onClick={handleArbitgateNavigation}
                className="quick-button bot-quick-button"
              >
                <Bot className="icon-small" />
                ArbitGate
              </button>
              
              <Link to="/login" className="quick-button logout-button">
                <ArrowLeft className="icon-small" />
                Logout
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}