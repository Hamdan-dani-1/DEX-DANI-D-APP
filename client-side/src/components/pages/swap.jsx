import { useEffect, useState } from 'react';
import { Connection, VersionedTransaction, PublicKey } from '@solana/web3.js';
import { useLocation, Link } from 'react-router';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import './Swap.css';

const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

function Swap() {
  const location = useLocation();
  const { userData, userInfo, wallet: walletFromState, pdaAddress } = location.state || {};
  const [wallet, setWallet] = useState(null);
  const [publicKey, setPublicKey] = useState(null);
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [inputAmount, setInputAmount] = useState(1);
  const [swapping, setSwapping] = useState(false);
  const [txSignature, setTxSignature] = useState(null);
  const [usePhantomWallet, setUsePhantomWallet] = useState(false);
  const [error, setError] = useState(null);

  if (!userData || !userInfo) {
    return (
      <div className="access-denied">
        <h1>⛔ Access Denied</h1>
        <p>No user data found. Please access this page through the dashboard.</p>
        <div className="access-denied-actions">
          <Link to="/dashboard" className="btn-primary">
            <ArrowLeft className="icon-small" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const connectWallet = async () => {
    if ('solana' in window && window.solana.isPhantom) {
      try {
        setLoading(true);
        setError(null);
        const response = await window.solana.connect();
        setWallet(window.solana);
        setPublicKey(response.publicKey.toString());
        setUsePhantomWallet(true);
      } catch (err) {
        setError('Failed to connect wallet: ' + err.message);
        console.error('Wallet connection error:', err);
      } finally {
        setLoading(false);
      }
    } else {
      setError('Phantom wallet not found! Please install Phantom wallet.');
    }
  };

  const disconnectWallet = async () => {
    if (wallet) {
      try {
        await wallet.disconnect();
        setWallet(null);
        setPublicKey(null);
        setQuote(null);
        setTxSignature(null);
        setUsePhantomWallet(false);
        setError(null);
      } catch (err) {
        console.error('Error disconnecting wallet:', err);
        setError('Error disconnecting wallet: ' + err.message);
      }
    }
  };

  const usePDAAddress = () => {
    setPublicKey(userData.address);
    setUsePhantomWallet(false);
    setWallet(null);
    setError(null);
  };

  const getQuote = async () => {
    if (!inputAmount || inputAmount <= 0) return;
    
    const swapPublicKey = usePhantomWallet ? publicKey : userData.address;
    if (!swapPublicKey) return;

    // Validate public key format
    try {
      new PublicKey(swapPublicKey);
    } catch (err) {
      setError('Invalid wallet address format');
      return;
    }

    const inputMint = 'So11111111111111111111111111111111111111112'; // SOL
    const outputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC
    const amount = Math.floor(inputAmount * 10 ** 9);

    const url = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url);
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(`Quote API error: ${res.status} - ${data.error || 'Unknown error'}`);
      }
      
      if (data.error) {
        setQuote(null);
        setError(`Quote error: ${data.error}`);
      } else {
        setQuote(data);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to get quote:', err);
      setQuote(null);
      setError(`Failed to get quote: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const executeSwap = async () => {
    if (!quote) {
      setError('Missing quote');
      return;
    }

    // Always use userData.address (PDA) for the swap
    const swapPublicKey = userData.address;
    if (!swapPublicKey) {
      setError('No PDA address available');
      return;
    }

    // Validate PDA address
    try {
      new PublicKey(swapPublicKey);
    } catch (err) {
      setError('Invalid PDA address format');
      return;
    }

    // Always require Phantom wallet for signing
    if (!wallet || !window.solana?.isConnected) {
      setError('Please connect Phantom wallet to sign transactions');
      return;
    }

    setSwapping(true);
    setTxSignature(null);
    setError(null);

    try {
      console.log('Getting swap transaction for PDA:', swapPublicKey);
      
      // Check account balance first
      const connection = new Connection(SOLANA_RPC, 'confirmed');
      try {
        const balance = await connection.getBalance(new PublicKey(swapPublicKey));
        console.log('Account balance:', balance / 10**9, 'SOL');
        
        const requiredAmount = inputAmount * 10**9;
        const estimatedFees = 5000000; // 0.005 SOL estimated fees
        
        if (balance < requiredAmount + estimatedFees) {
          throw new Error(`Insufficient balance. Required: ${(requiredAmount + estimatedFees) / 10**9} SOL, Available: ${balance / 10**9} SOL`);
        }
      } catch (err) {
        if (err.message.includes('Insufficient balance')) {
          throw err;
        }
        console.warn('Could not check balance:', err.message);
      }
      
      const swapRes = await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ 
          quoteResponse: quote, 
          userPublicKey: swapPublicKey, // Always use PDA
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 100000 // Fixed priority fee instead of 'auto'
        }),
      });

      if (!swapRes.ok) {
        const errorText = await swapRes.text();
        throw new Error(`Swap API error: ${swapRes.status} - ${errorText}`);
      }

      const swapData = await swapRes.json();
      
      if (swapData.error) {
        throw new Error(`Swap API returned error: ${swapData.error}`);
      }

      if (!swapData.swapTransaction) {
        throw new Error('No swap transaction returned from API');
      }

      console.log('Deserializing transaction...');
      
      let transaction;
      try {
        transaction = VersionedTransaction.deserialize(
          Buffer.from(swapData.swapTransaction, 'base64')
        );
        
        // Log transaction details for debugging
        console.log('Transaction message keys:', transaction.message.staticAccountKeys.length);
        console.log('Transaction signatures needed:', transaction.message.header.numRequiredSignatures);
        
        // Verify the transaction is properly formatted
        if (!transaction.message || !transaction.message.staticAccountKeys) {
          throw new Error('Invalid transaction structure');
        }
        
      } catch (err) {
        console.error('Transaction deserialization error:', err);
        throw new Error(`Failed to deserialize transaction: ${err.message}`);
      }

      console.log('Signing transaction with Phantom wallet...');
      
      // Check if wallet is still connected
      if (!window.solana.isConnected) {
        throw new Error('Wallet disconnected. Please reconnect and try again.');
      }

      // Sign with Phantom wallet - handle different signing methods
      let signedTx;
      try {
        // First try the standard signTransaction method
        if (typeof window.solana.signTransaction === 'function') {
          signedTx = await window.solana.signTransaction(transaction);
        } else if (typeof window.solana.signAllTransactions === 'function') {
          // Fallback to signAllTransactions for single transaction
          const signedTxs = await window.solana.signAllTransactions([transaction]);
          signedTx = signedTxs[0];
        } else {
          throw new Error('Wallet does not support transaction signing');
        }

        // Verify the transaction was actually signed
        if (!signedTx) {
          throw new Error('Transaction signing returned null/undefined');
        }

        // Verify the signature exists
        if (!signedTx.signatures || signedTx.signatures.length === 0) {
          throw new Error('Transaction was not properly signed - no signatures found');
        }

      } catch (err) {
        console.error('Signing error details:', err);
        
        if (err.message?.includes('User rejected') || err.message?.includes('rejected')) {
          throw new Error('Transaction was rejected by user');
        } else if (err.message?.includes('Ledger')) {
          throw new Error('Ledger signing error. Make sure your Ledger is connected and unlocked.');
        } else if (err.message?.includes('timeout') || err.message?.includes('Timeout')) {
          throw new Error('Signing timeout. Please try again.');
        } else if (err.code === 4001) {
          throw new Error('User rejected the transaction');
        } else if (err.code === -32603) {
          throw new Error('Wallet internal error. Please refresh and try again.');
        }
        
        throw new Error(`Failed to sign transaction: ${err.message || 'Unknown signing error'}`);
      }

      console.log('Sending transaction...');
      
      // Send transaction with better error handling
      let signature;
      try {
        // Create a fresh connection for sending
        const sendConnection = new Connection(SOLANA_RPC, 'confirmed');
        
        // Serialize the signed transaction
        const serializedTx = signedTx.serialize();
        console.log('Serialized transaction size:', serializedTx.length, 'bytes');
        
        // Check if transaction size is reasonable (should be < 1232 bytes)
        if (serializedTx.length > 1200) {
          console.warn('Transaction size is large:', serializedTx.length, 'bytes');
        }
        
        signature = await sendConnection.sendRawTransaction(
          serializedTx,
          {
            skipPreflight: false,
            preflightCommitment: 'processed',
            maxRetries: 5
          }
        );
        
        console.log('Transaction sent successfully, signature:', signature);
        
      } catch (err) {
        console.error('Send transaction error details:', err);
        
        // Handle specific RPC errors
        if (err.message?.includes('Transaction simulation failed')) {
          throw new Error('Transaction simulation failed. This may be due to insufficient balance, slippage, or market conditions.');
        } else if (err.message?.includes('Blockhash not found')) {
          throw new Error('Transaction expired. Please try again.');
        } else if (err.message?.includes('already processed')) {
          throw new Error('This transaction has already been processed.');
        } else if (err.message?.includes('Account does not exist')) {
          throw new Error('One of the required accounts does not exist. The PDA may not be initialized.');
        }
        
        throw new Error(`Failed to send transaction: ${err.message}`);
      }

      console.log('Transaction sent, signature:', signature);
      console.log('Confirming transaction...');

      // Confirm transaction with timeout
      try {
        const confirmConnection = new Connection(SOLANA_RPC, 'confirmed');
        
        console.log('Confirming transaction...');
        const confirmation = await confirmConnection.confirmTransaction(
          {
            signature,
            blockhash: transaction.message.recentBlockhash,
            lastValidBlockHeight: (await confirmConnection.getLatestBlockhash()).lastValidBlockHeight
          },
          'confirmed'
        );
        
        if (confirmation.value.err) {
          console.error('Transaction failed on-chain:', confirmation.value.err);
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }
        
        console.log('Transaction confirmed successfully');
        
      } catch (err) {
        console.error('Confirmation error:', err);
        // Don't throw here if it's just a confirmation timeout
        if (!err.message?.includes('Timeout') && !err.message?.includes('timeout')) {
          throw new Error(`Transaction confirmation failed: ${err.message}`);
        }
        console.log('Transaction sent but confirmation timed out. Check explorer for status.');
      }

      setTxSignature(signature);
      
      // Refresh quote after successful swap
      setTimeout(() => {
        getQuote();
      }, 2000);

      console.log('Swap completed successfully');
      
    } catch (err) {
      console.error('Swap execution error:', err);
      setError(`Swap failed: ${err.message}`);
    } finally {
      setSwapping(false);
    }
  };

  useEffect(() => {
    if ('solana' in window && window.solana.isPhantom && window.solana.isConnected) {
      setWallet(window.solana);
      if (!userData.address) {
        setPublicKey(window.solana.publicKey.toString());
        setUsePhantomWallet(true);
      }
    }
  }, [userData.address]);

  useEffect(() => {
    const swapAddress = usePhantomWallet ? publicKey : userData.address;
    if (swapAddress && inputAmount > 0) {
      const timeoutId = setTimeout(getQuote, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [publicKey, userData.address, inputAmount, usePhantomWallet]);

  return (
    <div className="transfer-container">
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
        <div className="swap-container">
          {userInfo && (
            <div className="user-card">
              <h3>👤 Account Info</h3>
              <p><b>Name:</b> {userInfo.name}</p>
              <p><b>Balance:</b> {userInfo.balance} SOL</p>
              <p><b>Address:</b> {userInfo.address}</p>
              {userData.address && (
                <p><b>PDA Address:</b> {userData.address}</p>
              )}
              <p><b>Connected Wallet:</b> {walletFromState}</p>
            </div>
          )}

          <div className="swap-card">
            <div className="transfer-header">
              <div className="transfer-icon">
                <RefreshCw className="icon-large" />
              </div>
              <h1 className="title">🚀 Jupiter Swap</h1>
              <p className="transfer-subtitle">
                Swap SOL for USDC using Jupiter's best routes
              </p>
            </div>

            {/* Error Display */}
            {error && (
              <div className="error-box" style={{
                background: '#fee',
                border: '1px solid #fcc',
                borderRadius: '8px',
                padding: '1rem',
                margin: '1rem 0',
                color: '#c33'
              }}>
                <strong>Error:</strong> {error}
              </div>
            )}

            {userData.address && (
              <div className="wallet-selection">
                <h3>Choose Swap Method:</h3>
                <div className="wallet-options">
                  <button 
                    onClick={usePDAAddress}
                    className={`wallet-option ${!usePhantomWallet ? 'active' : ''}`}
                  >
                    <div>🏦 Use PDA Address</div>
                    <div className="wallet-address">{userData.address}</div>
                  </button>
                  
                  <button 
                    onClick={connectWallet}
                    className={`wallet-option ${usePhantomWallet ? 'active' : ''}`}
                  >
                    <div>👻 Use Phantom Wallet</div>
                    <div className="wallet-address">
                      {publicKey && usePhantomWallet ? publicKey : 'Not Connected'}
                    </div>
                  </button>
                </div>
              </div>
            )}

            {!publicKey && !userData.address ? (
              <div className="center">
                <p>Connect Phantom to swap real tokens on Mainnet</p>
                <button onClick={connectWallet} disabled={loading} className="btn-primary">
                  {loading ? (
                    <>
                      <div className="loading-spinner" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      🔗 Connect Phantom Wallet
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div>
                <div className="wallet-info">
                  <div className="wallet-status">
                    <span>
                      {usePhantomWallet ? '✅ Phantom Wallet Connected' : '🏦 Using PDA Address'}
                    </span>
                    {usePhantomWallet && (
                      <button onClick={disconnectWallet} className="btn-secondary">
                        Disconnect
                      </button>
                    )}
                  </div>
                  <div className="pubkey">
                    {usePhantomWallet ? publicKey : userData.address}
                  </div>
                </div>

                <div className="swap-form">
                  <div className="form-field">
                    <label className="field-label">Enter SOL to swap for USDC</label>
                    <div className="input-group">
                      <input
                        type="number"
                        value={inputAmount}
                        onChange={(e) => setInputAmount(parseFloat(e.target.value) || 0)}
                        min="0.001"
                        step="0.001"
                        className="input-box"
                        placeholder="Enter amount in SOL"
                      />
                    </div>
                  </div>

                  <div className="quote-box">
                    <p>You will receive approximately:</p>
                    <div className="highlight">
                      {quote && quote.outAmount ? 
                        (parseInt(quote.outAmount) / 10 ** 6).toFixed(6) + ' USDC' : 
                        loading ? (
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                            <div className="loading-spinner" />
                            Loading...
                          </span>
                        ) : 
                        '0.000000 USDC'}
                    </div>
                  </div>

                  {quote && quote.routePlan && (
                    <div className="route-info">
                      <p><b>Route Information:</b></p>
                      <div className="route-path">
                        {quote.routePlan.map((step, i) => (
                          <span key={i} className="route-step">
                            {step.swapInfo?.label || 'DEX'}
                            {i < quote.routePlan.length - 1 && (
                              <span className="route-arrow"> → </span>
                            )}
                          </span>
                        ))}
                      </div>
                      <p className="price-impact">
                        Price Impact: {(parseFloat(quote.priceImpactPct || 0) * 100).toFixed(3)}%
                      </p>
                    </div>
                  )}

                  {txSignature && (
                    <div className="success-box">
                      <p className="success-title">✅ Swap Successful!</p>
                      <p className="success-method">
                        Used PDA Address with Phantom Signing
                      </p>
                      <a 
                        href={`https://explorer.solana.com/tx/${txSignature}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="tx-link"
                      >
                        View Transaction
                      </a>
                      <div className="tx-signature">{txSignature}</div>
                    </div>
                  )}

                  <button 
                    onClick={executeSwap} 
                    disabled={!quote || swapping || inputAmount <= 0 || !userData.address || !wallet}
                    className="btn-glow"
                  >
                    {swapping ? (
                      <>
                        <div className="loading-spinner" />
                        Swapping...
                      </>
                    ) : !quote ? (
                      '💡 Get Quote First'
                    ) : !wallet ? (
                      '⚠️ Connect Phantom to Sign'
                    ) : (
                      '🚀 Swap with PDA + Phantom Signing'
                    )}
                  </button>

                  {userData.address && (
                    <div className="pda-notice">
                      <p>
                        ⚠️ <strong>Note:</strong> Using PDA address for swap, but Phantom wallet is required for signing transactions.
                      </p>
                      {!wallet && (
                        <button onClick={connectWallet} className="btn-secondary">
                          Connect Phantom for Signing
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Swap;