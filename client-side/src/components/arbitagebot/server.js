// server.js - Updated version with Phantom wallet integration
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { Connection, VersionedTransaction, PublicKey } from "@solana/web3.js";

const app = express();
app.use(cors());
app.use(express.json());

// Config
const RPC = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
const JUPITER_API = "https://quote-api.jup.ag/v6";

const SOL   = "So11111111111111111111111111111111111111112";
const USDT  = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const USDC  = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const AMOUNT = 500_000_000; // 0.5 SOL
const MIN_PROFIT = 10_000_000; // 0.00001 SOL

// Get quote
async function getQuote(inputMint, outputMint, amount) {
  const url = `${JUPITER_API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=300`;
  const res = await fetch(url);
  return res.json();
}

// Create unsigned transaction
async function createSwapTransaction(quote, userPublicKey) {
  const res = await fetch(`${JUPITER_API}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: userPublicKey,
      wrapAndUnwrapSol: true,
    }),
  });
  
  const { swapTransaction } = await res.json();
  return swapTransaction;
}

// Execute signed transaction
async function executeSignedTransaction(signedTransactionBase64) {
  const txBytes = Buffer.from(signedTransactionBase64, "base64");
  const tx = VersionedTransaction.deserialize(txBytes);
  
  const sig = await RPC.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed"
  });
  
  await RPC.confirmTransaction(sig, "confirmed");
  return sig;
}

// Get wallet balance for any public key
async function getBalance(publicKey) {
  try {
    const pubkey = new PublicKey(publicKey);
    const balance = await RPC.getBalance(pubkey);
    return balance / 1_000_000_000; // Convert lamports to SOL
  } catch (error) {
    console.error("Error fetching balance:", error);
    return 0;
  }
}

// Check arbitrage: SOL → USDT → USDC → SOL
async function checkArbitrage() {
  try {
    console.log("Checking SOL → USDT → USDC → SOL...");
    
    // Step 1: SOL → USDT
    const quote1 = await getQuote(SOL, USDT, AMOUNT);
    if (!quote1.outAmount) return null;
    
    // Step 2: USDT → USDC  
    const quote2 = await getQuote(USDT, USDC, quote1.outAmount);
    if (!quote2.outAmount) return null;
    
    // Step 3: USDC → SOL
    const quote3 = await getQuote(USDC, SOL, quote2.outAmount);
    if (!quote3.outAmount) return null;
    
    const profit = BigInt(quote3.outAmount) - BigInt(AMOUNT);
    
    console.log(`Profit: ${profit} lamports (${Number(profit) / 1_000_000_000} SOL)`);
    
    // Return token amounts for UI display
    const tokenAmounts = {
      sol: AMOUNT.toString(),
      usdt: quote1.outAmount,
      usdc: quote2.outAmount,
      finalSol: quote3.outAmount
    };
    
    return { quote1, quote2, quote3, profit, tokenAmounts };
  } catch (err) {
    console.error("Error:", err.message);
    return null;
  }
}

// Balance endpoint
app.get("/balance/:publicKey", async (req, res) => {
  const { publicKey } = req.params;
  const balance = await getBalance(publicKey);
  res.json({ balance });
});

// Create swap transactions (unsigned)
app.post("/create-swap-transactions", async (req, res) => {
  const { userPublicKey } = req.body;
  
  try {
    const arb = await checkArbitrage();
    
    if (!arb) {
      return res.json({ profitable: false, error: "No routes found" });
    }
    
    const { quote1, quote2, quote3, profit, tokenAmounts } = arb;
    const profitable = profit > BigInt(MIN_PROFIT);
    
    if (!profitable) {
      return res.json({
        profitable: false,
        profit: profit.toString(),
        reason: "Not enough profit",
        tokenAmounts: tokenAmounts
      });
    }
    
    console.log("🚀 Creating unsigned transactions for profitable arbitrage...");
    
    // Create all three unsigned transactions
    const unsignedTx1 = await createSwapTransaction(quote1, userPublicKey);
    const unsignedTx2 = await createSwapTransaction(quote2, userPublicKey);
    const unsignedTx3 = await createSwapTransaction(quote3, userPublicKey);
    
    res.json({
      profitable: true,
      profit: profit.toString(),
      tokenAmounts: tokenAmounts,
      transactions: [
        { step: 1, transaction: unsignedTx1, description: "SOL → USDT" },
        { step: 2, transaction: unsignedTx2, description: "USDT → USDC" },
        { step: 3, transaction: unsignedTx3, description: "USDC → SOL" }
      ]
    });
    
  } catch (err) {
    console.error("Error creating transactions:", err);
    res.json({ 
      profitable: false, 
      error: err.message
    });
  }
});

// Execute signed transactions
app.post("/execute-signed-transaction", async (req, res) => {
  const { signedTransaction, step, userPublicKey } = req.body;
  
  try {
    const balanceBefore = await RPC.getBalance(new PublicKey(userPublicKey));
    
    const signature = await executeSignedTransaction(signedTransaction);
    
    const balanceAfter = await RPC.getBalance(new PublicKey(userPublicKey));
    
    res.json({
      success: true,
      signature: signature,
      step: step,
      balanceBefore: balanceBefore.toString(),
      balanceAfter: balanceAfter.toString(),
      balanceChange: (balanceAfter - balanceBefore).toString()
    });
    
  } catch (err) {
    console.error(`Error executing transaction step ${step}:`, err);
    res.json({ 
      success: false, 
      error: err.message,
      step: step
    });
  }
});

// API route for checking arbitrage opportunities
app.get("/arb", async (req, res) => {
  const arb = await checkArbitrage();
  
  if (!arb) {
    return res.json({ profitable: false, error: "No routes found" });
  }
  
  const { quote1, quote2, quote3, profit, tokenAmounts } = arb;
  const profitable = profit > BigInt(MIN_PROFIT);
  
  res.json({
    profitable: profitable,
    profit: profit.toString(),
    reason: profitable ? "Profitable opportunity found" : "Not enough profit",
    tokenAmounts: tokenAmounts
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    rpc: RPC.rpcEndpoint
  });
});

app.listen(5000, () => {
  console.log("Arbitrage bot running on port 5000");
  console.log("Ready for Phantom wallet connections");
});