#!/usr/bin/env node
/**
 * Stabilizer Finance BOT — CommonJS Edition
 * Automated volume farming on Stabilizer Finance testnet for efficient SP point accumulation.
 *
 * Author: hourx
 * GitHub: https://github.com/hourx
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");

const axios = require("axios");
const chalk = require("chalk");
const dotenv = require("dotenv");
const { ethers } = require("ethers");
const evm = require("evm_accounts");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { SocksProxyAgent } = require("socks-proxy-agent");

// Load .env
dotenv.config();

// ─── Constants & Config ───────────────────────────────────────────────────────
const WIB_TZ = "Asia/Jakarta";
const DEFAULT_SWAP_AMOUNT = Number(process.env.SWAP_AMOUNT || "50000"); // USD
const DEFAULT_DAILY_CAP = Number(process.env.DAILY_CAP || "20000"); // SP points
const DEFAULT_RPC = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const EXPLORER = "https://sepolia.etherscan.io/tx/";
const API_BASE = "https://app.stabilizer.finance";
const DECIMALS = 18;

// Contract addresses (Sepolia)
const ROUTER = "0xFa6419a3d3503a016dF3A59F690734862CA2A78D";
const AMM = "0xA3E36262f6899e27bB4B1802e8298e843E74CBC7";

// Token addresses (Sepolia)
const TOKENS = {
  USDT: "0xee0418Bd560613fbcF924C36235AB1ec301D4933",
  USDC: "0x77ef087024F87976aAdA0Aa7F73BB8EAe6E9dda1",
  USDS: "0xF85938e2Bfc178026f60c5Ea50cC347D42C73b3D",
  PYUSD: "0xF11Cf5a42c0a4F7e5BADe92c634Fd2649F4Ef53e",
  USDZ: "0x55Cc481D28Db3f1ffc9347745AA6fbB940505BdD",
};

// Minimal ABIs
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const ROUTER_ABI = [
  "function getAmountOut(address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256)",
  "function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut) returns (uint256 amountOut)",
];

// ─── Globals ──────────────────────────────────────────────────────────────────
let accounts = [];
let proxies = [];
let provider = null;
let running = true;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timestamp() {
  return new Date().toLocaleString("en-US", {
    timeZone: WIB_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function log(message) {
  console.log(
    `${chalk.cyanBright("[ " + timestamp() + " ]")} ${chalk.whiteBright("|")} ${message}`,
    { flush: true }
  );
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`${chalk.cyanBright("[ ? ]")} ${chalk.whiteBright(question + " : ")}`, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildProxyAgent(proxyUrl) {
  if (!proxyUrl) return undefined;
  try {
    if (proxyUrl.startsWith("http://") || proxyUrl.startsWith("https://")) {
      return new HttpsProxyAgent(proxyUrl);
    }
    if (proxyUrl.startsWith("socks5://") || proxyUrl.startsWith("socks5h://")) {
      return new SocksProxyAgent(proxyUrl);
    }
    // default to http
    return new HttpsProxyAgent("http://" + proxyUrl);
  } catch (err) {
    log(chalk.red("Proxy build error: ") + chalk.yellow(err.message));
    return undefined;
  }
}

function getProxyForIndex(index) {
  if (!proxies.length) return undefined;
  return proxies[index % proxies.length];
}

// ─── File Operations ──────────────────────────────────────────────────────────
function loadAccounts() {
  const file = path.join(process.cwd(), "accounts.txt");
  if (!fs.existsSync(file)) {
    log(chalk.yellow("accounts.txt not found, creating..."));
    fs.writeFileSync(file, "# One private key per line\n");
    return [];
  }
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const loaded = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    try {
      const wallet = new ethers.Wallet(line);
      loaded.push({ privateKey: line, address: wallet.address });
    } catch (e) {
      log(chalk.red("Invalid private key: ") + chalk.yellow(e.message.slice(0, 40) + "…"));
    }
  }
  log(chalk.greenBright(loaded.length) + chalk.white(" account(s) loaded"));
  accounts = loaded;
  return loaded;
}

function loadProxies() {
  const file = path.join(process.cwd(), "proxy.txt");
  if (!fs.existsSync(file)) {
    log(chalk.yellow("proxy.txt not found, creating..."));
    fs.writeFileSync(file, "# One proxy per line (optional)\n");
    return [];
  }
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const loaded = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line && !line.startsWith("#")) loaded.push(line);
  }
  log(chalk.greenBright(loaded.length) + chalk.white(" proxy(ies) loaded"));
  proxies = loaded;
  return loaded;
}

// ─── RPC / Blockchain ─────────────────────────────────────────────────────────
async function ensureRpcConnection() {
  try {
    provider = new ethers.JsonRpcProvider(DEFAULT_RPC, undefined, {
      staticNetwork: true,
    });
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    log(chalk.green("RPC connected") + chalk.white(" | Block: ") + chalk.whiteBright(blockNumber));
    return true;
  } catch (err) {
    log(chalk.red("RPC connection failed: ") + chalk.yellow(err.message));
    provider = null;
    return false;
  }
}

async function getSpStatus(walletAddress, proxyIndex = 0) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const agent = buildProxyAgent(getProxyForIndex(proxyIndex));
      const url = `${API_BASE}/api/zpoints/user/${walletAddress.toLowerCase()}`;
      const resp = await axios.get(url, { httpsAgent: agent, timeout: 15000 });
      const stats = resp.data?.stats || {};
      const result = {
        sp: Number(stats.totalPoints || 0),
        rank: Number(resp.data?.rank || 0),
        trades: Number(stats.totalTrades || 0),
        volume: Number(stats.totalVolume || 0),
        todaySp: Number(resp.data?.todaySpEarned || 0),
      };
      log(
        chalk.green(result.sp.toLocaleString()) + chalk.white(" SP") +
        chalk.white(" | Rank: ") + chalk.whiteBright("#" + result.rank) +
        chalk.white(" | Today: ") + chalk.blueBright(result.todaySp.toLocaleString())
      );
      return result;
    } catch (err) {
      if (attempt < 5) {
        await sleep(5000);
        continue;
      }
      log(chalk.red("SP Status fetch failed: ") + chalk.yellow(err.message));
    }
  }
  return null;
}

async function checkBalance(walletAddress, tokenAddress) {
  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  try {
    const raw = await tokenContract.balanceOf(walletAddress);
    return raw;
  } catch (err) {
    log(chalk.red("Balance check failed: ") + chalk.yellow(err.message));
    return 0n;
  }
}

async function approveIfNeeded(wallet, tokenAddress, spender, amount) {
  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  try {
    const allowance = await tokenContract.allowance(wallet.address, spender);
    if (allowance >= amount) {
      log(chalk.green("Already approved"));
      return { status: "already_approved" };
    }
    const tx = await tokenContract.approve(spender, ethers.MaxUint256);
    const receipt = await tx.wait();
    log(chalk.green("Approved") + chalk.white(" | TX: ") + chalk.whiteBright(tx.hash.slice(0, 20) + "…"));
    return { status: "approved", txHash: tx.hash, receipt };
  } catch (err) {
    log(chalk.red("Approve failed: ") + chalk.yellow(err.message));
    return null;
  }
}

async function executeSwap(wallet, tokenIn, tokenOut, amountIn) {
  const routerContract = new ethers.Contract(ROUTER, ROUTER_ABI, wallet);
  try {
    const amountOut = await routerContract.getAmountOut(tokenIn, tokenOut, amountIn);
    const minAmountOut = (amountOut * 999n) / 1000n; // 0.1% slippage buffer

    const nonce = await wallet.provider.getTransactionCount(wallet.address);
    const feeData = await wallet.provider.getFeeData();

    const tx = await wallet.sendTransaction({
      to: ROUTER,
      data: routerContract.interface.encodeFunctionData("swap", [
        tokenIn,
        tokenOut,
        amountIn,
        minAmountOut,
      ]),
      nonce,
      gasLimit: 500000,
      maxFeePerGas: feeData.maxFeePerGas || feeData.gasPrice,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || 0,
    });

    const receipt = await tx.wait();
    return { txHash: tx.hash, receipt, amountOut };
  } catch (err) {
    log(chalk.red("Swap failed: ") + chalk.yellow(err.message));
    return null;
  }
}

// ─── Actions ──────────────────────────────────────────────────────────────────
async function actionCheckSpStatus() {
  for (let idx = 0; idx < accounts.length; idx++) {
    const acc = accounts[idx];
    log(chalk.magentaBright("─".repeat(50)));
    log(chalk.whiteBright("Address: ") + acc.address);
    await getSpStatus(acc.address, idx);
  }
}

async function actionApproveTokens() {
  const amountWei = ethers.parseUnits(String(DEFAULT_SWAP_AMOUNT), DECIMALS);
  const approveAmount = amountWei * 100n; // generous approval

  for (const acc of accounts) {
    log(chalk.magentaBright("─".repeat(50)));
    log(chalk.whiteBright("Address: ") + acc.address);

    const proxyUrl = getProxyForIndex(accounts.indexOf(acc));
    try {
      // Rebind provider with proxy per account if needed
      const agent = buildProxyAgent(proxyUrl);
      const customProvider = agent
        ? new ethers.JsonRpcProvider(DEFAULT_RPC, undefined, { staticNetwork: true })
        : provider;

      const wallet = new ethers.Wallet(acc.privateKey, customProvider);
      const accounts = evm.wallets(acc.privateKey, customProvider);

      for (const [name, addr] of Object.entries(TOKENS)) {
        if (name === "USDZ") continue;
        log(chalk.blue(name) + chalk.white(" -> Router"));
        const result = await approveIfNeeded(wallet, addr, AMM, approveAmount);
        if (result && result.status === "approved") {
          log(chalk.green("Approved") + chalk.white(" | TX: ") + chalk.whiteBright(result.txHash.slice(0, 20) + "…"));
        }
      }
    } catch (err) {
      log(chalk.red("Approve sequence error: ") + chalk.yellow(err.message));
    }
  }
}

async function actionVolumeFarm() {
  let accIdx = -1;
  for (const acc of accounts) {
    accIdx++;
    log(chalk.magentaBright("─".repeat(50)));
    log(chalk.whiteBright("Address: ") + acc.address);
    log(chalk.blueBright("Starting volume farm..."));

    const status = await getSpStatus(acc.address, accIdx);
    if (!status) {
      log(chalk.red("Cannot get SP status, skipping"));
      continue;
    }
    if (status.todaySp >= DEFAULT_DAILY_CAP) {
      log(chalk.green("Daily cap reached! SP: ") + chalk.whiteBright(status.todaySp.toLocaleString()));
      continue;
    }

    const spRemaining = DEFAULT_DAILY_CAP - status.todaySp;
    const volumeNeeded = spRemaining * 100;
    const swapsNeeded = Math.floor(volumeNeeded / DEFAULT_SWAP_AMOUNT) + 1;
    log(chalk.white("Swaps needed: ") + chalk.whiteBright(swapsNeeded) + chalk.white(" @ $") + chalk.whiteBright(DEFAULT_SWAP_AMOUNT.toLocaleString()));

    const amountWei = ethers.parseUnits(String(DEFAULT_SWAP_AMOUNT), DECIMALS);
    let totalSwaps = 0;
    let totalVolume = 0;

    for (let i = 0; i < swapsNeeded; i++) {
      if (totalSwaps > 0 && totalSwaps % 10 === 0) {
        const fresh = await getSpStatus(acc.address, accIdx);
        if (fresh && fresh.todaySp >= DEFAULT_DAILY_CAP) {
          log(chalk.green("Daily cap reached!") + chalk.white(" | SP: ") + chalk.whiteBright(fresh.todaySp.toLocaleString()));
          break;
        }
      }

      log(chalk.white("Round ") + chalk.whiteBright(i + 1) + chalk.white("/") + chalk.whiteBright(swapsNeeded));

      const wallet = new ethers.Wallet(acc.privateKey, provider);

      // USDT -> USDZ
      const usdtBalance = await checkBalance(acc.address, TOKENS.USDT);
      const swapAmt = usdtBalance < amountWei ? usdtBalance : amountWei;
      if (swapAmt > 0n) {
        log(chalk.blue("USDT") + chalk.white(" -> ") + chalk.blue("USDZ") + chalk.white(" | $") + chalk.whiteBright((Number(swapAmt) / 10 ** DECIMALS).toLocaleString()));
        const res = await executeSwap(wallet, TOKENS.USDT, TOKENS.USDZ, swapAmt);
        if (res && res.receipt && res.receipt.status === 1) {
          log(chalk.green("Success") + chalk.white(" | TX: ") + chalk.whiteBright(res.txHash.slice(0, 20) + "…") + chalk.white(" | Gas: ") + chalk.whiteBright(res.receipt.gasUsed.toString()));
          totalSwaps++;
          totalVolume += Number(swapAmt) / 10 ** DECIMALS;
        } else if (res) {
          log(chalk.red("Failed") + chalk.white(" | TX: ") + chalk.whiteBright(res.txHash.slice(0, 20) + "…"));
        }
      } else {
        log(chalk.yellow("No USDT balance for round ") + chalk.yellow(i + 1));
      }

      await sleep(2000);

      // USDZ -> USDT
      const usdzBalance = await checkBalance(acc.address, TOKENS.USDZ);
      if (usdzBalance > 0n) {
        log(chalk.blue("USDZ") + chalk.white(" -> ") + chalk.blue("USDT") + chalk.white(" | $") + chalk.whiteBright((Number(usdzBalance) / 10 ** DECIMALS).toLocaleString()));
        const res = await executeSwap(wallet, TOKENS.USDZ, TOKENS.USDT, usdzBalance);
        if (res && res.receipt && res.receipt.status === 1) {
          log(chalk.green("Success") + chalk.white(" | TX: ") + chalk.whiteBright(res.txHash.slice(0, 20) + "…") + chalk.white(" | Gas: ") + chalk.whiteBright(res.receipt.gasUsed.toString()));
          totalSwaps++;
          totalVolume += Number(usdzBalance) / 10 ** DECIMALS;
        } else if (res) {
          log(chalk.red("Failed") + chalk.white(" | TX: ") + chalk.whiteBright(res.txHash.slice(0, 20) + "…"));
        }
      } else {
        log(chalk.yellow("No USDZ balance for round ") + chalk.yellow(i + 1));
      }

      await sleep(2000);
    }

    log(chalk.green("Volume farm done") + chalk.white(" | Swaps: ") + chalk.whiteBright(totalSwaps) + chalk.white(" | Volume: $") + chalk.whiteBright(totalVolume.toLocaleString()));
  }
}

// ─── Main Menu ────────────────────────────────────────────────────────────────
function printBanner() {
  console.log(`
    ${chalk.greenBright.bold("╔══════════════════════════════════════╗")}
    ${chalk.greenBright.bold("║")}  ${chalk.green("Siba")} ${chalk.blueBright.bold("Agent")}                          ${chalk.greenBright.bold("║")}
    ${chalk.greenBright.bold("║")}  ${chalk.whiteBright("Stabilizer Finance ")}${chalk.blueBright.bold("BOT")}        ${chalk.greenBright.bold("║")}
    ${chalk.greenBright.bold("╚══════════════════════════════════════╝")}

    ${chalk.yellowBright("⚡ github.com/hourx")}
  `);
}

async function printMenu() {
  console.log();
  console.log(chalk.cyanBright("[ MENU ]") + chalk.whiteBright(" ══════════════════════════════════"));
  console.log(chalk.greenBright("[1]") + chalk.whiteBright(" Check SP Status"));
  console.log(chalk.greenBright("[2]") + chalk.whiteBright(" Approve Tokens"));
  console.log(chalk.greenBright("[3]") + chalk.whiteBright(" Volume Farm (Auto-Swap)"));
  console.log(chalk.greenBright("[4]") + chalk.whiteBright(" Run All Features"));
  console.log();
}

async function runAll() {
  log(chalk.cyanBright("Running all features sequentially..."));
  await actionCheckSpStatus();
  await sleep(2000);
  await actionApproveTokens();
  await sleep(2000);
  await actionVolumeFarm();
}

function setupGracefulShutdown() {
  process.on("SIGINT", () => {
    running = false;
    console.log();
    log(chalk.yellowBright("[ EXIT ] Stabilizer Finance - BOT"));
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    running = false;
    log(chalk.yellowBright("[ EXIT ] Stabilizer Finance - BOT"));
    process.exit(0);
  });
}

// ─── Entry Point ──────────────────────────────────────────────────────────────
async function main() {
  printBanner();
  setupGracefulShutdown();

  while (running) {
    await printMenu();
    const choice = await prompt("Select option");

    if (!["1", "2", "3", "4"].includes(choice)) {
      log(chalk.red("Invalid option"));
      continue;
    }

    loadAccounts();
    loadProxies();

    const connected = await ensureRpcConnection();
    if (!connected) continue;

    if (choice === "1") {
      await actionCheckSpStatus();
    } else if (choice === "2") {
      await actionApproveTokens();
    } else if (choice === "3") {
      await actionVolumeFarm();
    } else if (choice === "4") {
      await runAll();
    }

    console.log();
    log(chalk.greenBright("All tasks completed"));
    log(chalk.yellowBright("Press Ctrl+C to exit"));
    console.log();
  }
}

main().catch((err) => {
  console.error(chalk.red("Fatal error: "), err);
  process.exit(1);
});
