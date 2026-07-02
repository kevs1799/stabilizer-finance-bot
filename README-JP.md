# Stabilizer Finance BOT — CommonJS 版

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)
![License](https://img.shields.io/badge/License-MIT-blue.svg)

> Stabilizer Finance テストネット（Sepolia）向けの自動ボリュームファーミングボットです。
> Router コントラクト経由で往復スワップを実行し、効率よく SP ポイントを蓄積し、デイリー上限に達すると自動停止します。

---

## 目次

- [概要](#概要)
- [機能](#機能)
- [要件](#要件)
- [インストール](#インストール)
- [設定](#設定)
- [使い方](#使い方)
- [プロキシ設定](#プロキシ設定)
- [仕組み](#仕組み)
- [トラブルシューティング](#トラブルシューティング)
- [セキュリティ上の注意](#セキュリティ上の注意)
- [貢献](#貢献)
- [ライセンス](#ライセンス)

---

## 概要

Stabilizer Finance BOT は、Stabilizer Finance テストネット（Sepolia）上でボリュームファーミングを自動化します。
サポートされているステーブルコイン（USDT ⟷ USDZ）間で Router コントラクトを通じた連続スワップを実行し、取引量を生み出します。これにより SP（Stability Points）を獲得でき、ボットは SP 残高をリアルタイムで監視し、デイリー目標に到達すると停止します。

このエディションは、**Python 版の完全な CommonJS（Node.js）リライト**です。Node.js 18+ がインストールされたサーバーで単体実行できるように設計されています。

---

## 機能

- **自動スワップ** — Router コントラクト経由で往復スワップ（USDT → USDZ → USDT）を自動実行。
- **マルチトークン対応** — USDT、USDC、USDS、PYUSD、USDZ。
- **SP ステータス追跡** — Stabilizer API 経由で SP ポイント、ランク、デイリー進捗をリアルタイム監視。
- **プロキシ対応** — HTTP、HTTPS、SOCKS5 プロキシに対応。アカウントごとにラウンドロビンで割当。
- **マルチアカウント** — `accounts.txt` から複数ウォレットを処理。
- **デイリーキャップ認識** — 設定した日次 SP 上限に達するとファーミングを自動停止。
- **ガス効率** — テストネットでガス使用を最適化する大きなスワップ額（デフォルト $50K、設定可能）。
- **スマート承認** — 現在の allowance が不足している場合にのみ Router への支出を自動承認。
- **きれいなロギング** — WIB（Asia/Jakarta）タイムゾーンのタイムスタンプ付きカラフルなターミナル出力。
- **グレースフルシャットダウン** — SIGINT / SIGTERM をクリーンに処理。

---

## 要件

- **Node.js** 18.0 以降。
- **Ethereum ウォレット** にテストネットトークン（Sepolia ETH + ステーブルコイン）があること。
- **RPC エンドポイント**（デフォルト: PublicNode Sepolia `https://ethereum-sepolia-rpc.publicnode.com`）。
- **任意:** HTTP / SOCKS5 プロキシ。

---

## インストール

1. リポジトリをクローン:

```bash
git clone https://github.com/kevs1799/stabilizer-finance-bot.git
cd stabilizer-finance-bot
```

2. 依存関係をインストール:

```bash
npm install
```

3. `.env.example` を `.env` にコピーして環境変数を設定:

```bash
cp .env.example .env
```

4. 秘密鍵を `accounts.txt` に追加（1行に1つ）:

```bash
0x秘密鍵1
0x秘密鍵2
```

5. （任意）プロキシを `proxy.txt` に追加（1行に1つ）:

```bash
http://ip:port
socks5://ip:port
```

---

## 設定

設定は `.env` の環境変数とプレーンテキスト設定ファイルで管理されます。

### `.env`

```env
SWAP_AMOUNT=50000       # 1レッグあたりのUSD換算スワップ額（デフォルト: 50000）
DAILY_CAP=20000         # 日次 SP 上限目標（デフォルト: 20000）
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
```

| 変数           | 説明                                           | デフォルト                                    |
|----------------|------------------------------------------------|-----------------------------------------------|
| `SWAP_AMOUNT`  | USD 換算のスワップ額                           | `50000`                                       |
| `DAILY_CAP`    | この SP 数に達したらファーミングを停止         | `20000`                                       |
| `RPC_URL`      | Sepolia JSON-RPC エンドポイント                | `https://ethereum-sepolia-rpc.publicnode.com` |

### `accounts.txt`

EVM 秘密鍵を1行に1つ追加。`#` で始まる行は無視されます。

```
# 1行に1つの秘密鍵
0xabc123...
0xdef456...
```

### `proxy.txt`

プロキシを1行に1つ追加。プロキシはアカウントごとにラウンドロビンで割り当てられます。アカウント数よりプロキシが少ない場合はパターンが繰り返されます。

```
# 対応フォーマット:
http://user:pass@host:port
https://user:pass@host:port
socks5://host:port
```

---

## 使い方

インタラクティブに起動:

```bash
node bot.js
# または
npm start
```

次のメニューが表示されます:

```
[ MENU ] ══════════════════════════════════
[1] SP ステータス確認
[2] トークン承認
[3] ボリュームファーミング（自動スワップ）
[4] 全機能をまとめて実行
[ ? ] オプションを選択 :
```

### メニューオプション

| オプション | 説明                                                                 |
|-----------|----------------------------------------------------------------------|
| `1`       | 各アカウントの現在の SP、世界ランク、総取引数、総ボリューム、本日獲得 SP を確認。 |
| `2`       | Router コントラクトがアカウントに代わってステーブルコインを使用することを承認。 |
| `3`       | 自動ファーミングループを実行: ステータス取得 → デイリー上限到達に必要なスワップ数を計算 → 実行。 |
| `4`       | オプション 1 → 2 → 3 を順番にまとめて実行。                          |

### サンプルフロー

```bash
node bot.js
# "4" を選択してトークン承認からファーミング開始までを1コマンドで実行
```

---

## プロキシ設定

Stabilizer API へのレート制限を回避し、RPC 負荷を分散するため、プロキシの使用を強く推奨します。

### 対応フォーマット

ボットは標準で3種類のプロキシフォーマットに対応しています。

- **HTTP:** `http://127.0.0.1:8080`
- **HTTPS:** `https://user:pass@proxy.example.com:443`
- **SOCKS5:** `socks5://127.0.0.1:1080`

### ラウンドロビン割当

各アカウントには、`accounts.txt` 内のインデックスを `proxy.txt` のプロキシ数で割った余りに基づいてプロキシが割り当てられます。

```
accounts: [A1, A2, A3, A4]
proxies : [P1, P2]

A1 → P1, A2 → P2, A3 → P1, A4 → P2
```

### 推奨プロバイダ

- [Smartproxy](https://smartproxy.com/)
- [Bright Data](https://brightdata.com/)
- [IPRoyal](https://iproyal.com/)

---

## 仕組み

### SP ステータス確認

ボットは `https://app.stabilizer.finance/api/zpoints/user/{wallet}` をクエリし、以下を抽出します:

- `totalPoints`（SP 合計）
- `rank`（世界ランキング順位）
- `totalTrades`（累積取引数）
- `totalVolume`（累計 USD ボリューム）
- `todaySpEarned`（本日獲得 SP）

### デイリーキャップ計算

```js
spRemaining  = DAILY_CAP - todaySpEarned;
volumeNeeded = spRemaining * 100; // 1 SP あたり約 100 ボリューム
swapsNeeded  = floor(volumeNeeded / SWAP_AMOUNT) + 1;
```

### 承認ロジック

各ステーブルコイン（USDT、USDC、USDS、PYUSD）について、ボットは:

1. 現在の `allowance(wallet, AMM)` を読み取る。
2. allowance が予定スワップ額 × 100 未満なら、`approve(AMM, MaxUint256)` トランザクションを送信する。
3. それ以外は承認をスキップする。

### ボリュームファーミングループ

必要な各ラウンドで:

1. **USDT → USDZ**
   USDT 残高を読み取り、全額（または `SWAP_AMOUNT`、小さい方）を Router 経由で USDZ にスワップする。
2. 2秒待機。
3. **USDZ → USDT**
   USDZ 残高を読み取り、全額を USDT にスワップし戻す。
4. 2秒待機。
5. 10ラウンドごとに API で SP ステータスを再確認。本日の上限に達していれば停止する。

この往復により両レッグでボリュームが生成される。

---

## トラブルシューティング

### RPC 接続失敗

- `RPC_URL` がサーバーから到達可能か確認してください。
- PublicNode はレート制限があります。専用の Infura / Alchemy / Annr キーの使用を検討してください。
- RPC にプロキシを使用する場合、ethers v6 のプロキシ対応は限定的なため、プロキシネゴシエーションを行うカスタム `JsonRpcProvider` が必要になる場合があります。

### 「資金不足」エラー

- ウォレットに **Sepolia ETH**（gas 用）とスワップ額に十分なステーブルコインの両方があることを確認してください。
- テストネットでは [faucet.quicknode.com](https://faucet.quicknode.com/) や [sepoliafaucet.com](https://sepoliafaucet.com/) などの faucet を利用してください。

### 承認が stuck する

- 承認トランザクションはマイニング済みなのにボットが再承認する場合、正しい spender アドレスを承認しているか確認してください（`AMM = 0xA3E...`）。
- 一部のトークン（例: 一部ネットワークの USDT）は `MaxUint256` を承認しません。この場合、特定の額に承認を制限してください。

### API / レート制限エラー

- Stabilizer API は頻繁なリクエストを抑制する場合があります。ボットは既に5秒ディレイで5回再試行しますが、多数のアカウントを実行する場合は追加のバックオフを検討してください。
- 利用可能であれば専用エンドポイントまたは API キーを登録してください。

---

## セキュリティ上の注意

- 秘密鍵を含む `accounts.txt` をバージョン管理に**絶対にコミットしない**でください。
- `.env` ファイルもローカルに保持し、追跡対象外にしてください。
- 読み取り専用鍵またはテストネット専用の資金を使用してください。
- 認証付きプロキシ（`user:pass`）は対応していますが、`proxy.txt` に保存すると平文で送信されます。プロダクション導入ではシークレット管理ツール（環境変数、Vault など）の利用を検討してください。
- このボットは**テストネット専用**です。メインネットでの無許可使用は利用規約に違反する可能性があります。

---

## 貢献

貢献を歓迎します！

1. リポジトリをフォーク
2. フィーチャーブランチを作成（`git checkout -b feature/amazing-feature`）
3. 変更をコミット（`git commit -m 'Add amazing feature'`）
4. ブランチにプッシュ（`git push origin feature/amazing-feature`）
5. Pull Request を作成

---

## ライセンス

MIT License。詳細は `LICENSE` を参照してください。

---
