import React, { useState, useEffect } from 'react';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { Program, AnchorProvider, web3, BN } from '@coral-xyz/anchor';
import { Send, Wallet, ArrowRight, CheckCircle, AlertCircle, DollarSign, RefreshCw, ArrowLeft } from 'lucide-react';
import { Link, useLocation } from "react-router";
import "./transfer.css"; // Import the CSS file

// Mock IDL - replace with your actual IDL
import idl from "../../../../target/idl/proj.json"

const PROGRAM_ID = new PublicKey("Ei59ErEipxrfh6bJkdXNHFxyE2YKsbpcj1ZQfBFHTWY6");
     
const SolTransfer = () => {
  const location = useLocation();
  const { userData, userInfo, wallet: walletFromState } = location.state || {};

  const [formData, setFormData] = useState({
    recipient: '',
    amount: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [connectedWallet, setConnectedWallet] = useState(null);
  const [balance, setBalance] = useState('0');
  const [refreshing, setRefreshing] = useState(false);

  // If no user data, show error message
  if (!userData || !userInfo) {
    return (
      <div className="transfer-container">
        <div className="access-denied-modal">
          <AlertCircle className="access-denied-icon" />
          <h1 className="access-denied-title">Access Denied</h1>
          <p className="access-denied-message">
            No user data found. Please access this page through the dashboard.
          </p>
          <div className="access-denied-buttons">
            <Link 
              to="/dashboard" 
              className="dashboard-link-button"
            >
              <ArrowLeft className="icon-small" />
              Go to Dashboard
            </Link>
            <Link 
              to="/login" 
              className="login-link-button"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  useEffect(() => {
    connectWallet();
  }, []);

  useEffect(() => {
    if (connectedWallet && userData) {
      fetchBalance();
    }
  }, [connectedWallet, userData]);

  const connectWallet = async () => {
    try {
      if (window.solana) {
        const response = await window.solana.connect();
        setConnectedWallet(response.publicKey);
      }
    } catch (err) {
      setError('Failed to connect wallet');
    }
  };

  const fetchBalance = async () => {
    if (!connectedWallet || !userData) return;
    
    setRefreshing(true);
    try {
      const connection = new Connection(clusterApiUrl('devnet'));
      const userDataPDA = new PublicKey(userData.address);
      const pdaBalance = await connection.getBalance(userDataPDA);
      const balanceInSol = pdaBalance / 1000000000;
      setBalance(balanceInSol.toFixed(4));
    } catch (err) {
      console.error('Error fetching balance:', err);
      setError('Failed to fetch balance');
    } finally {
      setRefreshing(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear success/error when user starts typing
    if (success || error) {
      setSuccess(false);
      setError('');
    }
  };

  const validateInputs = () => {
    if (!formData.recipient.trim()) {
      setError('Please enter a recipient address');
      return false;
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setError('Please enter a valid amount');
      return false;
    }

    try {
      new PublicKey(formData.recipient);
    } catch (err) {
      setError('Invalid recipient address');
      return false;
    }

    const amount = parseFloat(formData.amount);
    const currentBalance = parseFloat(balance);
    
    if (amount > currentBalance) {
      setError('Insufficient funds');
      return false;
    }

    // Reserve some SOL for rent exemption (approximately 0.002 SOL)
    if (amount > currentBalance - 0.002) {
      setError('Amount too high. Reserve some SOL for account rent.');
      return false;
    }

    return true;
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    
    if (!validateInputs()) return;

    setLoading(true);
    setError('');

    try {
      // Setup connection and provider
      const connection = new Connection(clusterApiUrl('devnet'));
      const provider = new AnchorProvider(connection, window.solana, {
        commitment: 'confirmed',
      });

      // Create program instance
      const program = new Program(idl, PROGRAM_ID, provider);

      // Convert SOL to lamports using web3.LAMPORTS_PER_SOL
      const amountInLamports = Math.floor(parseFloat(formData.amount) * web3.LAMPORTS_PER_SOL);

      // Generate PDA for user data - use the same seeds as account creation
      // The PDA should be derived using the wallet's public key as the authority
      const [userDataPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("user", "utf-8"),
          connectedWallet.toBytes(),
          Buffer.from(userData.name, "utf-8")
        ],
        PROGRAM_ID
      );

      // Verify this matches the expected PDA
      if (userDataPDA.toString() !== userData.address) {
        console.warn('PDA mismatch:', {
          generated: userDataPDA.toString(),
          expected: userData.address,
          wallet: connectedWallet.toString(),
          name: userData.name
        });
      } 

      const recipientPubkey = new PublicKey(formData.recipient);

      // Call transfer function with correct account structure
      const tx = await program.methods
        .transfer(new BN(amountInLamports))
        .accounts({
          fromUser: userDataPDA,
          recipient: recipientPubkey,
          payer: connectedWallet, // The wallet is the payer/signer
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();

      setSuccess(true);
      setFormData({ recipient: '', amount: '' });
      
      // Refresh balance after successful transfer
      setTimeout(() => {
        fetchBalance();
      }, 2000);

      console.log('Transfer successful, tx:', tx);

    } catch (err) {
      console.error('Transfer error:', err);
      if (err.message.includes('Insufficient funds')) {
        setError('Insufficient funds for transfer');
      } else if (err.message.includes('Unauthorized')) {
        setError('Unauthorized transfer');
      } else if (err.message.includes('Account not found')) {
        setError('User account not found or not initialized');
      } else {
        setError(err.message || 'Transfer failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMaxAmount = () => {
    const maxAmount = Math.max(0, parseFloat(balance) - 0.002); // Reserve for rent
    setFormData(prev => ({
      ...prev,
      amount: maxAmount.toFixed(4)
    }));
  };

  return (
    <div className="transfer-container">
      {/* Navigation back to dashboard */}
      <div className="nav-container">
        <Link
          to="/dashboard"
          state={{ userInfo, wallet: walletFromState }}
          className="back-to-dashboard"
        >
          <ArrowLeft className="icon-small" />
          Back to Dashboard
        </Link>
      </div>

      <div className="transfer-content">
        {/* Header */}
        <div className="transfer-header">
          <div className="transfer-icon">
            <Send className="icon-large" />
          </div>
          <h1 className="transfer-title">Send SOL</h1>
          <p className="transfer-subtitle">Transfer SOL from your account</p>
        </div>

        {/* Balance Card */}
        <div className="balance-card">
          <div className="balance-content">
            <div className="balance-info">
              <h3 className="balance-label">Your Balance</h3>
              <p className="balance-amount">{balance} SOL</p>
              <p className="balance-account">Account: {userData?.name}</p>
            </div>
            <button
              onClick={fetchBalance}
              disabled={refreshing}
              className="refresh-button"
            >
              <RefreshCw className={`refresh-icon ${refreshing ? 'spinning' : ''}`} />
            </button>
          </div>
        </div>

        {/* Transfer Form */}
        <div className="transfer-form-card">
          {/* Success Message */}
          {success && (
            <div className="success-message">
              <div className="message-content">
                <CheckCircle className="success-icon" />
                <div>
                  <p className="success-title">Transfer Successful!</p>
                  <p className="success-subtitle">SOL has been sent successfully</p>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="error-message">
              <div className="message-content">
                <AlertCircle className="error-icon" />
                <p className="error-text">{error}</p>
              </div>
            </div>
          )}

          <div className="form-fields">
            {/* Recipient Address */}
            <div className="form-field">
              <label className="field-label">
                Recipient Address
              </label>
              <div className="input-group">
                <Wallet className="input-icon" />
                <input
                  type="text"
                  name="recipient"
                  value={formData.recipient}
                  onChange={handleInputChange}
                  className="recipient-input"
                  placeholder="Enter recipient's Solana address"
                  required
                />
              </div>
            </div>

            {/* Amount */}
            <div className="form-field">
              <label className="field-label">
                Amount (SOL)
              </label>
              <div className="input-group">
                <DollarSign className="input-icon" />
                <input
                  type="number"
                  name="amount"
                  value={formData.amount}
                  onChange={handleInputChange}
                  step="0.0001"
                  min="0.0001"
                  max={balance}
                  className="amount-input"
                  placeholder="0.0000"
                  required
                />
                <button
                  type="button"
                  onClick={handleMaxAmount}
                  className="max-button"
                >
                  MAX
                </button>
              </div>
              <p className="field-help">
                Available: {balance} SOL (Reserve ~0.002 SOL for rent)
              </p>
            </div>

            {/* Transfer Preview */}
            {formData.recipient && formData.amount && (
              <div className="transfer-preview">
                <h4 className="preview-title">Transfer Preview</h4>
                <div className="preview-flow">
                  <div className="preview-sender">
                    <div className="sender-avatar">
                      <span className="avatar-letter">
                        {userData?.name?.charAt(0)?.toUpperCase()}
                      </span>
                    </div>
                    <span className="sender-label">Your Account</span>
                  </div>
                  
                  <ArrowRight className="flow-arrow" />
                  
                  <div className="preview-recipient">
                    <div className="recipient-avatar">
                      <Wallet className="avatar-icon" />
                    </div>
                    <span className="recipient-label">
                      {formData.recipient.slice(0, 8)}...{formData.recipient.slice(-8)}
                    </span>
                  </div>
                </div>
                
                <div className="preview-amount">
                  <span className="amount-display">
                    {formData.amount} SOL
                  </span>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              onClick={handleTransfer}
              disabled={loading || !connectedWallet || !formData.recipient || !formData.amount}
              className="submit-button"
            >
              {loading ? (
                <>
                  <div className="loading-spinner"></div>
                  Processing Transfer...
                </>
              ) : (
                <>
                  <Send className="submit-icon" />
                  Send SOL
                </>
              )}
            </button>
          </div>

          {/* Info */}
          <div className="info-section">
            <div className="info-content">
              <AlertCircle className="info-icon" />
              <div className="info-text">
                <p className="info-title">Important Notes:</p>
                <ul className="info-list">
                  <li>Transfers are irreversible</li>
                  <li>Small amount reserved for account rent</li>
                  <li>Transaction fees apply</li>
                  <li>Double-check recipient address</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SolTransfer;