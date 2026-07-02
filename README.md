# Stabilizer Finance BOT — CommonJS Edition

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)
![License](https://img.shields.io/badge/License-MIT-blue.svg)

> Automated volume farming bot for the Stabilizer Finance testnet (Sepolia).  
> Executes round-trip swaps through the Router contract to accumulate SP points efficiently, stopping when the daily cap is reached.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Proxy Setup](#proxy-setup)
- [How It Works](#how-it-works)
- [Troubleshooting](#troubleshooting)
- [Security Notes](#security-notes)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Stabilizer Finance BOT automates volume farming on the Stabilizer Finance testnet (Sepolia).  
It repeatedly swaps between supported stablecoins (USDT ⟷ USDZ) via the on-chain Router contract to generate trading volume, which in turn earns you SP (Stability Points). The bot automatically monitors your SP balance and stops once your daily target is reached.

This edition is a **complete CommonJS (Node.js) rewrite** of the original Python bot. It is designed to run standalone on any server with Node.js 18+ installed.

---

## Features

- **Auto-Swap** — Automated round-trip token swaps (USDT → USDZ → USDT) through the Router contract
- **Multi-Token Support** — USDT, USDC, USDS, PYUSD, USDZ
- **SP Status Tracking** — Real-time monitoring of SP points, rank, and daily progress via the Stabilizer API
- **Proxy Support** — HTTP, HTTPS, and SOCKS5 proxy support with round-robin assignment per account
- **Multi-Account** — Process multiple wallets from `accounts.txt`
- **Daily Cap Awareness** — Stops farming automatically when the configured daily SP cap is reached
- **Gas Efficient** — Large swap amounts (configurable, default $50K) for optimal gas usage on testnet
- **Smart Approvals** — Auto-approve tokens for Router spending only when the current allowance is insufficient
- **Beautiful Logging** — Colorful terminal output with timestamped WIB (Asia/Jakarta) timezone logs
- **Graceful Shutdown** — Handles SIGINT / SIGTERM cleanly

---

## Requirements

- **Node.js** 18.0 or higher
- **Ethereum wallet(s)** with testnet tokens (Sepolia ETH + stablecoins)
- **RPC endpoint** (default: PublicNode Sepolia `https://ethereum-sepolia-rpc.publicnode.com`)
- **Optional:** HTTP / SOCKS5 proxies

---

## Installation

1. Clone the repository:

```bash
git clone https://github.com/kevs1799/stabilizer-finance-bot.git
cd stabilizer-finance-bot
```

2. Install dependencies:

```bash
npm install
```

3. Copy `.env.example` to `.env` and configure the variables:

```bash
cp .env.example .env
```

4. Add your private keys to `accounts.txt` (one per line):

```
0xYourPrivateKey1
0xYourPrivateKey2
```

5. (Optional) Add proxies to `proxy.txt` (one per line):

```
http://ip:port
socks5://ip:port
```

---

## Configuration

All configuration is handled via environment variables in `.env` and plain-text config files.

### `.env`

```env
SWAP_AMOUNT=50000       # Swap amount in USD per leg (default: 50000)
DAILY_CAP=20000         # Daily SP cap target (default: 20000)
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
```

| Variable        | Description                            | Default                                   |
| --------------- | -------------------------------------- | ----------------------------------------- |
| `SWAP_AMOUNT`   | Notional swap amount in USD            | `50000`                                   |
| `DAILY_CAP`     | Stop farming after this many SP points | `20000`                                   |
| `RPC_URL`       | Sepolia JSON-RPC endpoint              | `https://ethereum-sepolia-rpc.publicnode.com` |

### `accounts.txt`

Add one EVM private key per line. Lines starting with `#` are ignored.

```
# One private key per line
0xabc123...
0xdef456...
```

### `proxy.txt`

Add your proxies (one per line). Proxies are assigned round-robin to accounts. If fewer proxies than accounts are supplied, the pattern repeats.

```
# Supported formats:
http://user:pass@host:port
https://user:pass@host:port
socks5://host:port
```

---

## Usage

Start the bot interactively:

```bash
node bot.js
# or
npm start
```

You will see an interactive menu:

```
[ MENU ] ══════════════════════════════════
[1] Check SP Status
[2] Approve Tokens
[3] Volume Farm (Auto-Swap)
[4] Run All Features
[ ? ] Select option :
```

### Menu Options

| Option | Description                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------ |
| `1`    | Check current SP points, global rank, total trades, total volume, and today's earned SP for each loaded account.   |
| `2`    | Check and (if needed) approve the Router contract to spend stablecoins on behalf of each account.                  |
| `3`    | Run the automated volume farming loop: fetch status, compute swaps needed to reach the daily cap, then execute.    |
| `4`    | Run option 1 → 2 → 3 sequentially in one go.                                                                       |

### Example Workflow

```bash
node bot.js
# Select "4" to approve tokens and start farming in one command
```

---

## Proxy Setup

Using proxies is highly recommended to avoid rate limits when querying the Stabilizer API and to distribute RPC load.

### Supported Formats

The bot supports three proxy formats out of the box:

- **HTTP:** `http://127.0.0.1:8080`
- **HTTPS:** `https://user:pass@proxy.example.com:443`
- **SOCKS5:** `socks5://127.0.0.1:1080`

### Round-Robin Assignment

Each account is assigned a proxy based on its index in `accounts.txt` modulo the number of proxies in `proxy.txt`.

```
accounts: [A1, A2, A3, A4]
proxies : [P1, P2]

A1 → P1, A2 → P2, A3 → P1, A4 → P2
```

### Recommended Providers

- [Smartproxy](https://smartproxy.com/)
- [Bright Data](https://brightdata.com/)
- [IPRoyal](https://iproyal.com/)

---

## How It Works

### SP Status Check

The bot queries `https://app.stabilizer.finance/api/zpoints/user/{wallet}` and extracts:

- `totalPoints` (total SP)
- `rank` (global leaderboard position)
- `totalTrades` (historical trade count)
- `totalVolume` (historical USD volume)
- `todaySpEarned` (SP earned today)

### Daily Cap Calculation

```js
spRemaining  = DAILY_CAP — todaySpEarned;
volumeNeeded = spRemaining * 100; // approx 100 volume per SP
swapsNeeded  = floor(volumeNeeded / SWAP_AMOUNT) + 1;
```

### Approval Logic

For each stablecoin (USDT, USDC, USDS, PYUSD), the bot:

1. Reads the current `allowance(wallet, AMM)`.
2. If the allowance is lower than the planned swap amount × 100, it sends an `approve(AMM, MaxUint256)` transaction.
3. Otherwise, it skips approval.

### Volume Farming Loop

For each required round:

1. **USDT → USDZ**  
   Read USDT balance, swap the full balance (or `SWAP_AMOUNT`, whichever is smaller) to USDZ via the Router.
2. Wait 2 seconds.
3. **USDZ → USDT**  
   Read USDZ balance, swap the full balance back to USDT.
4. Wait 2 seconds.
5. Every 10 rounds, re-check API SP status. If today's cap is reached, stop.

This round-trip generates volume on both legs.

---

## Troubleshooting

### RPC Connection Failures

- Verify the `RPC_URL` is reachable from your server.
- PublicNode rate-limits apply. Consider using a dedicated Infura / Alchemy / Ankr key.
- If using a proxy for RPC, note that ethers v6 proxy support is limited; you may need a custom `JsonRpcProvider` with proxy negotiation.

### "Insufficient Funds" Errors

- Ensure the wallet has both **Sepolia ETH** (for gas) and enough of the target stablecoin for the swap amount.
- On testnet, use faucets like [faucet.quicknode.com](https://faucet.quicknode.com/) or [sepoliafaucet.com](https://sepoliafaucet.com/).

### Stuck Approvals

- If an approval transaction is mined but the bot still re-approves, check that you are approving the correct spender address (`AMM = 0xA3E...`).
- Some tokens (e.g., USDT on some networks) do not approve `MaxUint256`. If you encounter issues, limit the approval to a specific amount.

### API / Rate Limit Errors

- The Stabilizer API may throttle frequent requests. The bot already retries 5 times with a 5-second delay, but consider adding additional backoff if you run many accounts.
- Register for a dedicated endpoint or API key if available.

---

## Security Notes

- **Never** commit `accounts.txt` containing private keys to version control.
- The `.env` file should also remain local and untracked.
- Use read-only keys or test funds on testnets only.
- Proxies with authentication (`user:pass`) are supported but transmitted in plaintext if stored in `proxy.txt`. Consider secret-management tools (environment variables, Vault, etc.) for production deployments.
- This bot is for **testnet use only**. Unauthorized use on mainnets may violate service terms.

---

## Contributing

Contributions are welcome!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

MIT License. See `LICENSE` for details.

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/hourx">hourx</a>
</p>
