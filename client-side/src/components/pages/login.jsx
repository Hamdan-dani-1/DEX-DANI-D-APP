// LoginPage.jsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { Program, AnchorProvider, utils } from '@coral-xyz/anchor';
import { 
  User, Lock, Wallet, LogIn, Shield, Globe, 
  CheckCircle, AlertCircle 
} from 'lucide-react';
import idl from '../../../../target/idl/proj.json';
import './login.css'

const PROGRAM_ID = new PublicKey("Ei59ErEipxrfh6bJkdXNHFxyE2YKsbpcj1ZQfBFHTWY6");

const LoginPage = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ name: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [wallet, setWallet] = useState(null);
  const [userInfo, setUserInfo] = useState(null);

  const connectWallet = async () => {
    try {
      if (window.solana) {
        const response = await window.solana.connect();
        setWallet(response.publicKey);
        setError('');
      } else {
        setError('Please install Phantom wallet');
      }
    } catch (err) {
      setError('Failed to connect wallet');
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!wallet) {
      setError('Please connect your wallet first');
      return;
    }
    if (!formData.name || !formData.password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const connection = new Connection(clusterApiUrl('devnet'));
      const provider = new AnchorProvider(connection, window.solana, { commitment: 'confirmed' });
      const program = new Program(idl, PROGRAM_ID, provider);

      const [userDataPDA] = PublicKey.findProgramAddressSync(
        [
          utils.bytes.utf8.encode("user"),
          wallet.toBytes(),
          utils.bytes.utf8.encode(formData.name)
        ],
        PROGRAM_ID
      );

      await program.methods
        .login(formData.name, formData.password)
        .accounts({
          userdata: userDataPDA,
          payer: wallet,
        })
        .rpc();

      const userData = await program.account.userData.fetch(userDataPDA);
      const pdaBalance = await connection.getBalance(userDataPDA);
      const balanceInSol = pdaBalance / 1e9;

      setUserInfo({
        name: userData.name,
        email: userData.email,
        address: userDataPDA.toString(),
        balance: balanceInSol
      });
      setSuccess(true);

    } catch (err) {
      console.error('Login error:', err);
      if (err.message.includes('Invalid credentials')) {
        setError('Invalid username or password');
      } else if (err.message.includes('Account does not exist')) {
        setError('Account not found. Please sign up first.');
      } else {
        setError(err.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDashboardNavigation = () => {
    navigate('/dashboard', { 
      state: { userInfo: userInfo, wallet: wallet?.toString() } 
    });
  };

  useEffect(() => {
    if (success && userInfo) {
      const timer = setTimeout(() => handleDashboardNavigation(), 2000);
      return () => clearTimeout(timer);
    }
  }, [success, userInfo]);

  return (
    <div className="login-container">
      {/* Floating Particles */}
      <div className="particles-container">
        <div className="particle particle-1"></div>
        <div className="particle particle-2"></div>
        <div className="particle particle-3"></div>
        <div className="particle particle-4"></div>
        <div className="particle particle-5"></div>
        <div className="particle particle-6"></div>
        <div className="particle particle-7"></div>
        <div className="particle particle-8"></div>
      </div>

      {/* Gradient Overlay */}
      <div className="gradient-overlay"></div>

      {/* Login Card */}
      <div className="login-card">
        {/* Header */}
        <div className="login-header">
          <div className="login-icon">
            <LogIn size={32} />
          </div>
          <h1 className="login-title">Welcome Back</h1>
          <p className="login-subtitle">Sign in to your Solana account</p>
        </div>

        {/* Wallet Connection */}
        {!wallet ? (
          <button onClick={connectWallet} className="wallet-connect-btn">
            <Wallet size={20} />
            Connect Phantom Wallet
          </button>
        ) : (
          <div className="wallet-connected">
            <CheckCircle size={20} />
            <p className="wallet-connected-title">Wallet Connected</p>
            <p className="wallet-address">
              {wallet.toString().slice(0, 12)}...{wallet.toString().slice(-12)}
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="error-message">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Success Message */}
        {success && userInfo && (
          <div className="success-message">
            <CheckCircle size={40} className="success-icon" />
            <div className="success-content">
              <h3 className="success-title">Login Successful!</h3>
              <p className="success-subtitle">Welcome back, {userInfo.name}!</p>
            </div>
            <div className="user-info">
              <div className="info-row">
                <span className="info-label">Name:</span>
                <span className="info-value">{userInfo.name}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Email:</span>
                <span className="info-value">{userInfo.email}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Balance:</span>
                <span className="info-value balance">{userInfo.balance.toFixed(4)} SOL</span>
              </div>
            </div>
          </div>
        )}

        {/* Login Form */}
        {!success && (
          <div className="login-form">
            {/* Username Field */}
            <div className="input-group">
              <User size={20} className="input-icon" />
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Username"
                className="form-input"
              />
            </div>

            {/* Password Field */}
            <div className="input-group">
              <Lock size={20} className="input-icon" />
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                placeholder="Password"
                onKeyPress={(e) => e.key === 'Enter' && handleSubmit(e)}
                className="form-input"
              />
            </div>

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={loading || !wallet}
              className="submit-btn"
            >
              {loading ? (
                <div className="loading-spinner"></div>
              ) : (
                <>
                  <LogIn size={20} />
                  Sign In
                </>
              )}
            </button>
          </div>
        )}

        {/* Footer */}
        {!success && (
          <p className="login-footer">
            Don't have an account?{' '}
            <Link to="/signup" className="signup-link">
              Create one here
            </Link>
          </p>
        )}
      </div>
    </div>
  );
};

export default LoginPage;