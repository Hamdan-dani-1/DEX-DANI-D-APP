// SignupPage.jsx
import React, { useState } from 'react';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { Program, AnchorProvider, web3, utils } from '@coral-xyz/anchor';
import { User, Mail, Lock, Wallet, Sparkles, Shield, Globe } from 'lucide-react';
import idl from '../../../../target/idl/proj.json';
import { Link } from "react-router"; 
import { Buffer } from 'buffer';
window.Buffer = Buffer;
import './signup.css';

const PROGRAM_ID = new PublicKey("Ei59ErEipxrfh6bJkdXNHFxyE2YKsbpcj1ZQfBFHTWY6");

const SignupPage = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [wallet, setWallet] = useState(null);

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
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!wallet) {
      setError('Please connect your wallet first');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const connection = new Connection(clusterApiUrl('devnet'));
      const provider = new AnchorProvider(connection, window.solana, {
        commitment: 'confirmed',
      });

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
        .register(formData.name, formData.email, formData.password)
        .accounts({
          userdata: userDataPDA,
          payer: wallet,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();

      setSuccess(true);
      setFormData({ name: '', email: '', password: '', confirmPassword: '' });
      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      console.error('Registration error:', err);
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="gradient-overlay"></div>

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

      <div className="login-card">
        {/* Header */}
        <div className="login-header">
          <div className="login-icon">
            <Sparkles size={32} />
          </div>
          <h1 className="login-title">Create Account</h1>
          <p className="login-subtitle">Join Solana decentralized network</p>
        </div>

        {/* Wallet */}
        {!wallet ? (
          <button onClick={connectWallet} className="wallet-connect-btn">
            <Wallet size={20} />
            Connect Phantom Wallet
          </button>
        ) : (
          <div className="wallet-connected">
            <Shield size={20} />
            <p className="wallet-connected-title">Wallet Connected</p>
            <p className="wallet-address">
              {wallet.toString().slice(0, 8)}...{wallet.toString().slice(-8)}
            </p>
          </div>
        )}

        {/* Messages */}
        {success && <div className="success-message">🎉 Registration successful!</div>}
        {error && <div className="error-message">{error}</div>}

        {/* Form */}
        <form className="signup-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <User className="input-icon" />
            <input
              type="text"
              name="name"
              className="form-input"
              placeholder="Full Name"
              value={formData.name}
              onChange={handleInputChange}
              required
            />
          </div>
          <div className="input-group">
            <Mail className="input-icon" />
            <input
              type="email"
              name="email"
              className="form-input"
              placeholder="Email Address"
              value={formData.email}
              onChange={handleInputChange}
              required
            />
          </div>
          <div className="input-group">
            <Lock className="input-icon" />
            <input
              type="password"
              name="password"
              className="form-input"
              placeholder="Password"
              value={formData.password}
              onChange={handleInputChange}
              required
            />
          </div>
          <div className="input-group">
            <Lock className="input-icon" />
            <input
              type="password"
              name="confirmPassword"
              className="form-input"
              placeholder="Confirm Password"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              required
            />
          </div>

          <button type="submit" className="submit-btn" disabled={loading || !wallet}>
            {loading ? (
              <>
                <div className="loading-spinner"></div> Creating Account...
              </>
            ) : (
              <>
                <Globe size={20} /> Create Account
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="login-footer">
          Already have an account?{" "}
          <Link to="/login" className="signup-link">Sign in</Link>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;
