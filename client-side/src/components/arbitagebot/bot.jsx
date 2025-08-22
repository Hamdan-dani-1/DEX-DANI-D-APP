import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, DollarSign, RefreshCw, ExternalLink, Pause, Play, ArrowRight, AlertTriangle, Info, Settings, TrendingUp, Clock, Target, Wallet, CheckCircle, User, Home } from 'lucide-react';
import { Buffer } from 'buffer';
import { useLocation, Link } from 'react-router';
import "./bot.css"
window.Buffer = Buffer;

const App = () => {
  const location = useLocation();
  const { userData, userInfo, wallet: walletFromState, pdaAddress } = location.state || {};
  
  // Extract user data from location state
  const userName = userData?.name || userInfo?.name || 'Unknown User';
  const userEmail = userData?.email || userInfo?.email || 'No Email';
  const userPDAAddress = userData?.address || userInfo?.address || pdaAddress || null;
  const userBalance = userData?.balance || userInfo?.balance || 0;
  
  const [phantomWallet, setPhantomWallet] = useState(null);
  const [phantomConnected, setPhantomConnected] = useState(false);
  const [currentBalance, setCurrentBalance] = useState(userBalance);
  const [arbitrageData, setArbitrageData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [debugInfo, setDebugInfo] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('unknown');
  const [executingTrades, setExecutingTrades] = useState(false);
  const [autoSettings, setAutoSettings] = useState({
    interval: 15,
    maxAttempts: 100,
    minProfitThreshold: 0.00001,
    stopOnError: true
  });
  const [sessionStats, setSessionStats] = useState({
    startTime: null,
    totalChecks: 0,
    successfulTrades: 0,
    totalProfit: 0,
    avgProfitPerTrade: 0,
    uptime: '00:00:00'
  });
  const [stats, setStats] = useState({
    checks: 0,
    opportunities: 0,
    totalProfit: 0
  });
  
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);
  const uptimeRef = useRef(null);

  // Check if we have required user data
  if (!userData && !userInfo) {
    return (
      <div className="bot-container">
        <div className="access-denied">
          <h1>⛔ Access Denied</h1>
          <p>No user data found. Please access this page through the dashboard.</p>
          <Link to="/login" className="dashboard-link">
            <Home className="icon" />
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  const addDebugInfo = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo(prev => [
      { timestamp, message, type, id: Date.now() },
      ...prev.slice(0, 49)
    ]);
  }, []);

  const updateUptime = useCallback(() => {
    if (startTimeRef.current && isAutoRunning) {
      const now = new Date();
      const diff = now - startTimeRef.current;
      const hours = Math.floor(diff / 3600000).toString().padStart(2, '0');
      const minutes = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
      const seconds = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
      setSessionStats(prev => ({ ...prev, uptime: `${hours}:${minutes}:${seconds}` }));
    }
  }, [isAutoRunning]);

  const getProvider = () => {
    if ('phantom' in window) {
      const provider = window.phantom?.solana;
      if (provider?.isPhantom) {
        return provider;
      }
    }
    addDebugInfo('❌ Phantom wallet not found. Please install Phantom wallet extension.', 'error');
    window.open('https://phantom.app/', '_blank');
    return null;
  };

  const connectPhantom = async () => {
    try {
      const provider = getProvider();
      if (!provider) {
        return;
      }

      addDebugInfo('🔌 Connecting to Phantom wallet for signing...', 'info');
      const resp = await provider.connect();
      setPhantomWallet(provider);
      setPhantomConnected(true);
      addDebugInfo(`✅ Phantom connected for signing: ${resp.publicKey.toString().slice(0, 8)}...${resp.publicKey.toString().slice(-4)}`, 'success');
      
    } catch (err) {
      addDebugInfo(`❌ Failed to connect Phantom: ${err.message}`, 'error');
      setError(`Failed to connect Phantom: ${err.message}`);
    }
  };

  const disconnectPhantom = async () => {
    try {
      if (phantomWallet) {
        await phantomWallet.disconnect();
      }
      setPhantomWallet(null);
      setPhantomConnected(false);
      addDebugInfo('🔌 Phantom disconnected', 'info');
      
      if (isAutoRunning) {
        stopAutoBot();
      }
      
    } catch (err) {
      addDebugInfo(`❌ Error disconnecting Phantom: ${err.message}`, 'error');
    }
  };

  const testConnection = async () => {
    try {
      addDebugInfo('🔍 Testing backend connection...', 'info');
      const response = await fetch('http://localhost:5000/health');
      const data = await response.json();
      
      if (response.ok) {
        setConnectionStatus('connected');
        addDebugInfo(`✅ Backend connected: ${data.status} (RPC: ${data.rpc})`, 'success');
        return true;
      } else {
        setConnectionStatus('error');
        addDebugInfo('❌ Backend responded with error status', 'error');
        return false;
      }
    } catch (err) {
      setConnectionStatus('disconnected');
      addDebugInfo(`❌ Backend connection failed: ${err.message}`, 'error');
      addDebugInfo('💡 Make sure your Node.js server is running on port 5000', 'warning');
      return false;
    }
  };

  const fetchBalance = async () => {
    try {
      if (!userPDAAddress) {
        addDebugInfo('❌ No PDA address available for balance fetch', 'error');
        return null;
      }

      addDebugInfo('💰 Fetching PDA balance...', 'info');
      const response = await fetch(`http://localhost:5000/balance/${userPDAAddress}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setCurrentBalance(data.balance);
      addDebugInfo(`💰 Balance updated: ${data.balance.toFixed(6)} SOL`, 'success');
      return data.balance;
    } catch (err) {
      const errorMsg = `Failed to fetch balance: ${err.message}`;
      setError(errorMsg);
      addDebugInfo(errorMsg, 'error');
      return null;
    }
  };

  const executeArbitrageTrade = useCallback(async (isAutoExecution = false) => {
    if (!phantomConnected || !phantomWallet) {
      addDebugInfo('❌ Cannot execute trade: Phantom wallet not connected for signing', 'error');
      return;
    }

    if (!userPDAAddress) {
      addDebugInfo('❌ Cannot execute trade: No PDA address available', 'error');
      return;
    }

    if (connectionStatus !== 'connected') {
      addDebugInfo('❌ Cannot execute trade: Backend not connected', 'error');
      return;
    }

    if (executingTrades) {
      addDebugInfo('⏳ Trade already in progress, skipping execution', 'warning');
      return;
    }

    setExecutingTrades(true);
    
    if (isAutoExecution) {
      addDebugInfo('🤖 AUTO-TRADE: Starting automatic trade execution...', 'success');
    } else {
      addDebugInfo('👤 MANUAL-TRADE: Starting manual trade execution...', 'info');
    }
    
    addDebugInfo(`🎯 Using PDA Address: ${userPDAAddress.slice(0, 8)}...${userPDAAddress.slice(-4)}`, 'info');

    try {
      const response = await fetch('http://localhost:5000/create-swap-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPublicKey: userPDAAddress // Use PDA address
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.profitable) {
        addDebugInfo(`❌ Trade not profitable: ${data.reason || data.error || 'Unknown reason'}`, 'error');
        return;
      }

      addDebugInfo(`💰 Executing profitable trade with ${data.transactions.length} transactions`, 'success');
      addDebugInfo(`🎯 Expected profit: ${(Number(data.profit) / 1_000_000_000).toFixed(6)} SOL`, 'info');
      
      const executedTxs = [];
      let totalBalanceChange = 0;

      for (const [index, txData] of data.transactions.entries()) {
        addDebugInfo(`📝 Signing transaction ${index + 1}/${data.transactions.length}: ${txData.description}`, 'info');
        
        try {
          const transactionBuffer = Buffer.from(txData.transaction, 'base64');
          
          const { VersionedTransaction } = await import('@solana/web3.js');
          const transaction = VersionedTransaction.deserialize(transactionBuffer);
          
          addDebugInfo(`✍️ Requesting signature from Phantom wallet...`, 'info');
          
          const signedTransaction = await phantomWallet.signTransaction(transaction);
          const signedTxBase64 = Buffer.from(signedTransaction.serialize()).toString('base64');
          
          addDebugInfo(`✅ Transaction ${index + 1} signed, submitting to blockchain...`, 'success');
          
          const execResponse = await fetch('http://localhost:5000/execute-signed-transaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              signedTransaction: signedTxBase64,
              step: index + 1,
              userPublicKey: userPDAAddress // Use PDA address
            })
          });

          if (!execResponse.ok) {
            throw new Error(`HTTP ${execResponse.status}: ${execResponse.statusText}`);
          }

          const execResult = await execResponse.json();
          
          if (execResult.success) {
            executedTxs.push(execResult.signature);
            totalBalanceChange += Number(execResult.balanceChange);
            addDebugInfo(`✅ Step ${index + 1} completed: ${execResult.signature}`, 'success');
            addDebugInfo(`💰 Balance change: ${(Number(execResult.balanceChange) / 1_000_000_000).toFixed(6)} SOL`, 'info');
          } else {
            throw new Error(`Step ${index + 1} execution failed: ${execResult.error}`);
          }
          
          if (index < data.transactions.length - 1) {
            addDebugInfo(`⏳ Waiting 2 seconds before next transaction...`, 'info');
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
        } catch (stepError) {
          addDebugInfo(`❌ Step ${index + 1} failed: ${stepError.message}`, 'error');
          throw stepError;
        }
      }

      const profitSol = Number(data.profit) / 1_000_000_000;
      
      handleSuccessfulTrade({
        profit: data.profit,
        transactions: executedTxs,
        tokenAmounts: data.tokenAmounts,
        balanceChange: totalBalanceChange.toString()
      });
      
      addDebugInfo(`🎉 Arbitrage completed successfully!`, 'success');
      addDebugInfo(`💰 Total profit: ${profitSol.toFixed(6)} SOL`, 'success');
      addDebugInfo(`🔗 Transaction signatures: ${executedTxs.join(', ')}`, 'info');
      
      setTimeout(() => fetchBalance(), 3000);
      
    } catch (err) {
      addDebugInfo(`❌ Trade execution failed: ${err.message}`, 'error');
      setError(`Trade execution failed: ${err.message}`);
      
      if (autoSettings.stopOnError && isAutoRunning) {
        addDebugInfo('🛑 Stopping auto-bot due to execution error', 'error');
        stopAutoBot();
      }
    } finally {
      setExecutingTrades(false);
    }
  }, [phantomConnected, phantomWallet, userPDAAddress, connectionStatus, executingTrades, autoSettings.stopOnError, isAutoRunning, addDebugInfo]);

  const checkArbitrage = useCallback(async () => {
    if (connectionStatus !== 'connected') {
      addDebugInfo('❌ Cannot check arbitrage: Backend not connected', 'error');
      return null;
    }

    setLoading(true);
    setError(null);
    addDebugInfo('🔍 Scanning for arbitrage opportunities (SOL → USDT → USDC → SOL)...', 'info');
    
    try {
      const response = await fetch('http://localhost:5000/arb');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setArbitrageData(data);
      
      setStats(prev => ({
        ...prev,
        checks: prev.checks + 1,
        opportunities: prev.opportunities + (data.profitable ? 1 : 0)
      }));

      setSessionStats(prev => ({
        ...prev,
        totalChecks: prev.totalChecks + 1
      }));

      if (data.profitable) {
        const profitSol = Number(data.profit) / 1_000_000_000;
        addDebugInfo(`💰 Profitable opportunity found! Expected profit: ${profitSol.toFixed(6)} SOL`, 'success');
        
        if (data.tokenAmounts) {
          addDebugInfo(`📊 Route: ${(Number(data.tokenAmounts.sol) / 1_000_000_000).toFixed(3)} SOL → ${(Number(data.tokenAmounts.usdt) / 1_000_000).toFixed(2)} USDT → ${(Number(data.tokenAmounts.usdc) / 1_000_000).toFixed(2)} USDC → ${(Number(data.tokenAmounts.finalSol) / 1_000_000_000).toFixed(6)} SOL`, 'info');
        }
        
        if (isAutoRunning && phantomConnected && profitSol >= autoSettings.minProfitThreshold && !executingTrades) {
          addDebugInfo('🤖 AUTO-EXECUTE: Executing profitable trade automatically!', 'success');
          addDebugInfo(`💰 Profit ${profitSol.toFixed(6)} SOL meets threshold of ${autoSettings.minProfitThreshold} SOL`, 'info');
          
          executeArbitrageTrade(true).catch(error => {
            addDebugInfo(`❌ AUTO-EXECUTE: Trade failed - ${error.message}`, 'error');
          });
          
        } else if (isAutoRunning && executingTrades) {
          addDebugInfo('⏳ AUTO-EXECUTE: Trade already in progress, skipping...', 'warning');
        } else if (isAutoRunning && profitSol < autoSettings.minProfitThreshold) {
          addDebugInfo(`⏭️ AUTO-EXECUTE: Skipping trade - profit ${profitSol.toFixed(6)} SOL below threshold ${autoSettings.minProfitThreshold} SOL`, 'warning');
        } else if (isAutoRunning && !phantomConnected) {
          addDebugInfo('❌ AUTO-EXECUTE: Cannot execute - Phantom not connected for signing', 'error');
        } else if (!isAutoRunning) {
          addDebugInfo('💡 Manual mode: Profitable trade found but auto-execute is disabled', 'info');
        }
      } else {
        const reason = data.reason || data.error || 'Unknown reason';
        addDebugInfo(`❌ No profitable opportunity: ${reason}`, 'warning');
      }

      return data;
    } catch (err) {
      const errorMsg = `Failed to check arbitrage: ${err.message}`;
      setError(errorMsg);
      addDebugInfo(errorMsg, 'error');
      
      if (autoSettings.stopOnError && isAutoRunning) {
        addDebugInfo('🛑 Stopping auto-bot due to error', 'error');
        stopAutoBot();
      }
      
      return null;
    } finally {
      setLoading(false);
    }
  }, [connectionStatus, isAutoRunning, phantomConnected, autoSettings.minProfitThreshold, executingTrades, autoSettings.stopOnError, executeArbitrageTrade, addDebugInfo]);

  const handleSuccessfulTrade = (data) => {
    const profitSol = Number(data.profit) / 1_000_000_000;
    
    setTransactions(prev => [
      {
        time: new Date().toLocaleTimeString(),
        date: new Date().toLocaleDateString(),
        profit: data.profit,
        txIds: data.transactions || [],
        balanceChange: data.balanceChange,
        tokenAmounts: data.tokenAmounts,
        id: Date.now()
      },
      ...prev.slice(0, 49)
    ]);
    
    setStats(prev => ({
      ...prev,
      totalProfit: prev.totalProfit + profitSol
    }));

    setSessionStats(prev => {
      const newSuccessfulTrades = prev.successfulTrades + 1;
      const newTotalProfit = prev.totalProfit + profitSol;
      return {
        ...prev,
        successfulTrades: newSuccessfulTrades,
        totalProfit: newTotalProfit,
        avgProfitPerTrade: newTotalProfit / newSuccessfulTrades
      };
    });
  };

  const stopAutoBot = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    if (uptimeRef.current) {
      clearInterval(uptimeRef.current);
      uptimeRef.current = null;
    }
    
    setIsAutoRunning(false);
    startTimeRef.current = null;
    addDebugInfo('🛑 Auto-bot stopped', 'info');
  }, [addDebugInfo]);

  const startAutoBot = useCallback(() => {
    if (connectionStatus !== 'connected') {
      addDebugInfo('❌ Cannot start: Backend not connected', 'error');
      setError('Cannot start auto-bot: Backend server is not connected.');
      return;
    }

    if (!phantomConnected) {
      addDebugInfo('❌ Cannot start: Phantom wallet not connected for signing', 'error');
      setError('Cannot start auto-bot: Please connect Phantom wallet for signing.');
      return;
    }

    if (!userPDAAddress) {
      addDebugInfo('❌ Cannot start: No PDA address available', 'error');
      setError('Cannot start auto-bot: No PDA address available.');
      return;
    }

    setIsAutoRunning(true);
    startTimeRef.current = new Date();
    setError(null);
    
    setSessionStats({
      startTime: new Date().toLocaleTimeString(),
      totalChecks: 0,
      successfulTrades: 0,
      totalProfit: 0,
      avgProfitPerTrade: 0,
      uptime: '00:00:00'
    });

    addDebugInfo(`🤖 AUTO-TRADING BOT STARTED!`, 'success');
    addDebugInfo(`🏦 Using PDA Address: ${userPDAAddress.slice(0, 8)}...${userPDAAddress.slice(-4)}`, 'info');
    addDebugInfo(`✍️ Using Phantom for signing: ${phantomWallet.publicKey.toString().slice(0, 8)}...${phantomWallet.publicKey.toString().slice(-4)}`, 'info');
    addDebugInfo(`⚡ AUTO-EXECUTE MODE: ENABLED`, 'success');
    addDebugInfo(`🔍 Scanning interval: Every ${autoSettings.interval} seconds`, 'info');
    addDebugInfo(`💰 Min profit threshold: ${autoSettings.minProfitThreshold} SOL`, 'info');
    
    checkArbitrage();
    intervalRef.current = setInterval(checkArbitrage, autoSettings.interval * 1000);
    uptimeRef.current = setInterval(updateUptime, 1000);
  }, [connectionStatus, phantomConnected, userPDAAddress, phantomWallet, autoSettings.interval, autoSettings.minProfitThreshold, checkArbitrage, updateUptime, addDebugInfo]);

  const toggleAutoRun = () => {
    if (isAutoRunning) {
      stopAutoBot();
    } else {
      startAutoBot();
    }
  };

  const clearDebugInfo = () => {
    setDebugInfo([]);
    addDebugInfo('🧹 Debug console cleared', 'info');
  };

  const refreshBalance = () => {
    if (userPDAAddress) {
      fetchBalance();
    } else {
      addDebugInfo('❌ Cannot refresh balance: No PDA address available', 'error');
    }
  };

  useEffect(() => {
    testConnection();
    
    const checkPhantomConnection = async () => {
      const provider = getProvider();
      if (provider) {
        try {
          addDebugInfo('🔍 Checking for existing Phantom connection...', 'info');
          const resp = await provider.connect({ onlyIfTrusted: true });
          setPhantomWallet(provider);
          setPhantomConnected(true);
          addDebugInfo(`✅ Phantom auto-reconnected: ${resp.publicKey.toString().slice(0, 8)}...${resp.publicKey.toString().slice(-4)}`, 'success');
        } catch (err) {
          addDebugInfo('ℹ️ No previous Phantom connection found', 'info');
        }
      }
    };
    
    checkPhantomConnection();
    
    // Initial balance fetch if PDA address is available
    if (userPDAAddress) {
      addDebugInfo(`👤 User: ${userName} (${userEmail})`, 'info');
      addDebugInfo(`🏦 PDA Address: ${userPDAAddress.slice(0, 8)}...${userPDAAddress.slice(-4)}`, 'info');
      addDebugInfo(`💰 Initial Balance: ${userBalance} SOL`, 'info');
      fetchBalance();
    }
    
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (uptimeRef.current) clearInterval(uptimeRef.current);
    };
  }, [addDebugInfo, userName, userEmail, userPDAAddress, userBalance]);

  const formatSol = (lamports) => (Number(lamports) / 1_000_000_000).toFixed(6);
  const formatUsd = (amount, decimals = 6) => (Number(amount) / Math.pow(10, decimals)).toFixed(2);

  // Create state object to pass back to dashboard
  const dashboardState = {
    userInfo: userInfo || userData,
    wallet: walletFromState || (userData ? userData.wallet : null)
  };

  return (
    <div className="bot-container">
      <div className="bot-content">
        {/* Header */}
        <header className="bot-header">
          <div className="header-left">
            <div className="header-icon">
              <Zap className="icon-large" />
              {isAutoRunning && <div className="status-indicator active"></div>}
            </div>
            <div className="header-info">
              <h1>ArbitGate Bot</h1>
              <div className="connection-status">
                <div className={`status-dot ${connectionStatus === 'connected' ? 'connected' : 'disconnected'}`}></div>
                <span>{connectionStatus === 'connected' ? 'Backend Connected' : 'Backend Disconnected'}</span>
                <div className={`status-dot ${phantomConnected ? 'connected' : 'disconnected'}`}></div>
                <span>{phantomConnected ? 'Phantom Connected' : 'Phantom Disconnected'}</span>
              </div>
            </div>
          </div>
          
          <div className="header-right">
            <Link 
              to="/dashboard" 
              state={dashboardState}
              className="back-button"
            >
              <Home className="icon" />
              Dashboard
            </Link>
          </div>
        </header>

        {/* User Info Card */}
        <div className="user-info-card">
          <h3>👤 Account Information</h3>
          <div className="user-details">
            <p><strong>Name:</strong> {userName}</p>
            <p><strong>Email:</strong> {userEmail}</p>
            <p><strong>PDA Address:</strong> {userPDAAddress ? `${userPDAAddress.slice(0, 12)}...${userPDAAddress.slice(-12)}` : 'Not available'}</p>
            <p><strong>Balance:</strong> {currentBalance?.toFixed(6) || '0.000000'} SOL</p>
            <button onClick={refreshBalance} className="refresh-button">
              <RefreshCw className="icon" />
              Refresh
            </button>
          </div>
        </div>

        {/* Connection Warnings */}
        {connectionStatus !== 'connected' && (
          <div className="warning-card error">
            <AlertTriangle className="icon" />
            <div>
              <span className="warning-title">Backend server not connected</span>
              <p>Please ensure your Node.js server is running on port 5000.</p>
            </div>
          </div>
        )}

        {!phantomConnected && (
          <div className="warning-card warning">
            <AlertTriangle className="icon" />
            <div>
              <span className="warning-title">Phantom wallet needed for signing</span>
              <p>Connect Phantom wallet to enable transaction signing.</p>
            </div>
          </div>
        )}

        {/* Phantom Wallet Connection */}
        <div className="wallet-section">
          <h3>🔐 Phantom Wallet (For Signing)</h3>
          {!phantomConnected ? (
            <div className="wallet-connect">
              <p>Connect Phantom wallet to enable transaction signing</p>
              <button onClick={connectPhantom} className="connect-button">
                <Wallet className="icon" />
                Connect Phantom
              </button>
            </div>
          ) : (
            <div className="wallet-connected">
              <div className="wallet-info">
                <span className="connected-status">✅ Connected for Signing</span>
                <p className="wallet-address">
                  {phantomWallet?.publicKey?.toString().slice(0, 8)}...{phantomWallet?.publicKey?.toString().slice(-4)}
                </p>
              </div>
              <button onClick={disconnectPhantom} className="disconnect-button">
                Disconnect
              </button>
            </div>
          )}
        </div>

        {/* Auto-Execute Status Banner */}
        {isAutoRunning && (
          <div className="status-banner active">
            <div className="banner-left">
              <div className="pulse-dot"></div>
              <div>
                <span className="banner-title">🤖 AUTO-EXECUTE MODE ACTIVE</span>
                <p>Bot is scanning every {autoSettings.interval}s and will automatically execute profitable trades</p>
              </div>
            </div>
            <div className="banner-right">
              <div className="next-scan">Next scan in:</div>
              <div className="countdown">{loading ? 'Scanning...' : `${autoSettings.interval}s`}</div>
            </div>
          </div>
        )}

        {/* Session Stats */}
        {sessionStats.startTime && (
          <div className="stats-card">
            <h3>
              <TrendingUp className="icon" />
              Session Statistics
            </h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-label">Started</div>
                <div className="stat-value">{sessionStats.startTime}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Uptime</div>
                <div className="stat-value">{sessionStats.uptime}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Total Checks</div>
                <div className="stat-value">{sessionStats.totalChecks}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Successful Trades</div>
                <div className="stat-value success">{sessionStats.successfulTrades}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Total Profit</div>
                <div className="stat-value success">{sessionStats.totalProfit.toFixed(6)} SOL</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Avg Profit/Trade</div>
                <div className="stat-value">{sessionStats.avgProfitPerTrade.toFixed(6)} SOL</div>
              </div>
            </div>
          </div>
        )}

        {/* Control Panel */}
        <div className="control-panel">
          <div className="controls-left">
            <h2>
              <Settings className="icon" />
              Control Panel
            </h2>
            
            <div className="control-section">
              <div className="control-item">
                <div className="control-info">
                  <h3>Auto Trading Bot</h3>
                  <p className={isAutoRunning ? 'status-active' : ''}>
                    {isAutoRunning ? '🤖 ACTIVE - Auto-executing profitable trades' : 'Automatically execute profitable trades'}
                  </p>
                </div>
                <button
                  onClick={toggleAutoRun}
                  disabled={!phantomConnected || connectionStatus !== 'connected' || !userPDAAddress}
                  className={`toggle-button ${isAutoRunning ? 'stop' : 'start'}`}
                >
                  {isAutoRunning ? <Pause className="icon" /> : <Play className="icon" />}
                  {isAutoRunning ? 'Stop Bot' : 'Start Bot'}
                </button>
              </div>

              <div className="control-item">
                <div className="control-info">
                  <h3>Manual Arbitrage Check</h3>
                  <p>Scan for opportunities once</p>
                </div>
                <button
                  onClick={checkArbitrage}
                  disabled={loading || executingTrades || connectionStatus !== 'connected'}
                  className="check-button"
                >
                  {loading ? <RefreshCw className="icon spinning" /> : <Target className="icon" />}
                  {loading ? 'Checking...' : 'Check Now'}
                </button>
              </div>

              {arbitrageData?.profitable && !isAutoRunning && (
                <div className="control-item">
                  <div className="control-info">
                    <h3 className="profitable">Execute Trade</h3>
                    <p>Profit: {formatSol(arbitrageData.profit)} SOL</p>
                  </div>
                  <button
                    onClick={() => executeArbitrageTrade(false)}
                    disabled={executingTrades || !phantomConnected}
                    className="execute-button"
                  >
                    {executingTrades ? <RefreshCw className="icon spinning" /> : <Zap className="icon" />}
                    {executingTrades ? 'Executing...' : 'Execute Trade'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="controls-right">
            <h2>
              <Settings className="icon" />
              Bot Settings
            </h2>
            
            <div className="settings-section">
              <div className="setting-item">
                <label>Check Interval (seconds)</label>
                <input
                  type="number"
                  value={autoSettings.interval}
                  onChange={(e) => setAutoSettings(prev => ({ ...prev, interval: Math.max(5, parseInt(e.target.value) || 5) }))}
                  min="5"
                  max="300"
                />
              </div>
              
              <div className="setting-item">
                <label>Min Profit Threshold (SOL)</label>
                <input
                  type="number"
                  value={autoSettings.minProfitThreshold}
                  onChange={(e) => setAutoSettings(prev => ({ ...prev, minProfitThreshold: Math.max(0, parseFloat(e.target.value) || 0) }))}
                  step="0.00001"
                  min="0"
                />
              </div>

              <div className="setting-item toggle">
                <span>Stop on Error</span>
                <button
                  onClick={() => setAutoSettings(prev => ({ ...prev, stopOnError: !prev.stopOnError }))}
                  className={`toggle-switch ${autoSettings.stopOnError ? 'active' : ''}`}
                >
                  <span className="toggle-slider"></span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Current Opportunity Display */}
        {arbitrageData && (
          <div className="opportunity-card">
            <h2>
              {arbitrageData.profitable ? (
                <>
                  <CheckCircle className="icon success" />
                  Profitable Opportunity Found!
                </>
              ) : (
                <>
                  <Info className="icon warning" />
                  No Profitable Opportunity
                </>
              )}
            </h2>
            
            {arbitrageData.profitable ? (
              <div className="opportunity-grid">
                <div className="opportunity-item">
                  <div className="opportunity-label">Expected Profit</div>
                  <div className="opportunity-value profit">{formatSol(arbitrageData.profit)} SOL</div>
                </div>
                
                {arbitrageData.tokenAmounts && (
                  <>
                    <div className="opportunity-item">
                      <div className="opportunity-label">Start Amount</div>
                      <div className="opportunity-value">{formatSol(arbitrageData.tokenAmounts.sol)} SOL</div>
                    </div>
                    
                    <div className="opportunity-item">
                      <div className="opportunity-label">Via USDT</div>
                      <div className="opportunity-value">{formatUsd(arbitrageData.tokenAmounts.usdt)} USDT</div>
                    </div>
                    
                    <div className="opportunity-item">
                      <div className="opportunity-label">Final Amount</div>
                      <div className="opportunity-value profit">{formatSol(arbitrageData.tokenAmounts.finalSol)} SOL</div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="no-opportunity">
                <div className="no-opportunity-label">Reason:</div>
                <div className="no-opportunity-text">{arbitrageData.reason || arbitrageData.error || 'No profitable path found'}</div>
              </div>
            )}
          </div>
        )}

        {/* Transaction History */}
        {transactions.length > 0 && (
          <div className="transactions-card">
            <h2>
              <Clock className="icon" />
              Recent Transactions
            </h2>
            
            <div className="transactions-list">
              {transactions.slice(0, 10).map((tx) => (
                <div key={tx.id} className="transaction-item">
                  <div className="transaction-left">
                    <div className="transaction-profit">+{formatSol(tx.profit)} SOL</div>
                    <div className="transaction-time">{tx.date} at {tx.time}</div>
                  </div>
                  <div className="transaction-right">
                    {tx.txIds.map((txId, idx) => (
                      <div key={idx} className="transaction-link">
                        <a
                          href={`https://solscan.io/tx/${txId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {txId.slice(0, 8)}...{txId.slice(-4)}
                          <ExternalLink className="icon" />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Debug Console */}
        <div className="debug-console">
          <div className="debug-header">
            <h2>
              <Info className="icon" />
              Debug Console
            </h2>
            <button onClick={clearDebugInfo} className="clear-button">
              Clear
            </button>
          </div>
          
          <div className="debug-content">
            {debugInfo.length === 0 ? (
              <div className="debug-empty">No debug information yet...</div>
            ) : (
              debugInfo.map((log) => (
                <div key={log.id} className={`debug-line ${log.type}`}>
                  <span className="debug-time">[{log.timestamp}]</span> {log.message}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="error-card">
            <AlertTriangle className="icon" />
            <div>
              <span className="error-title">Error:</span> {error}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;