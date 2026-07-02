# Stabilizer Finance BOT — Phiên bản CommonJS

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)
![License](https://img.shields.io/badge/License-MIT-blue.svg)

> Bot tự động farm volume trên testnet của Stabilizer Finance (Sepolia).
> Thực hiện swap khứ hồi qua hợp đồng Router để tích lũy điểm SP hiệu quả, dừng lại khi đạt hạn mức ngày.

---

## Mục lục

- [Tổng quan](#tổng-quan)
- [Tính năng](#tính-năng)
- [Yêu cầu](#yêu-cầu)
- [Cài đặt](#cài-đặt)
- [Cấu hình](#cấu-hình)
- [Sử dụng](#sử-dụng)
- [Thiết lập Proxy](#thiết-lập-proxy)
- [Cách hoạt động](#cách-hoạt-động)
- [Khắc phục sự cố](#khắc-phục-sự-cố)
- [Lưu ý bảo mật](#lưu-ý-bảo-mật)
- [Đóng góp](#đóng-góp)
- [Giấy phép](#giấy-phép)

---

## Tổng quan

Stabilizer Finance BOT tự động farm volume trên testnet của Stabilizer Finance (Sepolia).
Bot liên tục swap giữa các stablecoin được hỗ trợ (USDT ⟷ USDZ) qua hợp đồng Router trên chuỗi để tạo ra khối lượng giao dịch, từ đó giúp bạn kiếm được SP (Stability Points). Bot tự động theo dõi số dư SP của bạn và dừng lại khi đạt mục tiêu ngày.

Phiên bản này là bản **viết lại hoàn toàn bằng CommonJS (Node.js)** từ bot gốc bằng Python. Nó được thiết kế để chạy độc lập trên bất kỳ server nào có cài Node.js 18+.

---

## Tính năng

- **Swap tự động** — Tự động swap token khứ hồi (USDT → USDZ → USDT) qua hợp đồng Router.
- **Hỗ trợ đa token** — USDT, USDC, USDS, PYUSD, USDZ.
- **Theo dõi SP** — Giám sát thời gian thực điểm SP, thứ hạng và tiến trình ngày qua API của Stabilizer.
- **Hỗ trợ Proxy** — Hỗ trợ proxy HTTP, HTTPS và SOCKS5 với phân phối round-robin theo tài khoản.
- **Đa tài khoản** — Xử lý nhiều ví từ `accounts.txt`.
- **Nhận biết hạn mức ngày** — Dừng farm tự động khi đạt mức SP ngày được cấu hình.
- **Tiết kiệm gas** — Số lượng swap lớn (có thể cấu hình, mặc định $50K) để tối ưu phí gas trên testnet.
- **Phê duyệt thông minh** — Tự động phê duyệt token cho Router chỉ khi allowance hiện tại không đủ.
- **Ghi log đẹp** — Terminal đầy màu với log timestamp theo múi giờ WIB (Asia/Jakarta).
- **Tắt ứng dụng an toàn** — Xử lý sạch sẽ tín hiệu SIGINT / SIGTERM.

---

## Yêu cầu

- **Node.js** phiên bản 18.0 trở lên.
- **Ví Ethereum** có token testnet (ETH Sepolia + stablecoin).
- **RPC endpoint** (mặc định: PublicNode Sepolia `https://ethereum-sepolia-rpc.publicnode.com`).
- **Tùy chọn:** Proxy HTTP / SOCKS5.

---

## Cài đặt

1. Clone repository:

```bash
git clone https://github.com/kevs1799/stabilizer-finance-bot.git
cd stabilizer-finance-bot
```

2. Cài đặt dependencies:

```bash
npm install
```

3. Copy `.env.example` sang `.env` và cấu hình các biến:

```bash
cp .env.example .env
```

4. Thêm private key vào `accounts.txt` (mỗi dòng 1 key):

```bash
0xPrivateKey1
0xPrivateKey2
```

5. (Tùy chọn) Thêm proxy vào `proxy.txt` (mỗi dòng 1 proxy):

```bash
http://ip:port
socks5://ip:port
```

---

## Cấu hình

Tất cả cấu hình được quản lý qua biến môi trường trong `.env` và tập tin cấu hình dạng văn bản thuần.

### `.env`

```env
SWAP_AMOUNT=50000       # Số lượng swap theo USD mỗi chân (mặc định: 50000)
DAILY_CAP=20000         # Mục tiêu SP ngày (mặc định: 20000)
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
```

| Biến        | Mô tả                                        | Mặc định                                    |
|-------------|----------------------------------------------|----------------------------------------------| 
| `SWAP_AMOUNT` | Giá trị swap theo giá USD                    | `50000`                                      |
| `DAILY_CAP`   | Dừng farm sau số điểm SP này trong ngày      | `20000`                                      |
| `RPC_URL`     | Endpoint JSON-RPC của Sepolia               | `https://ethereum-sepolia-rpc.publicnode.com` | 

### `accounts.txt`

Thêm 1 private key EVM mỗi dòng. Các dòng bắt đầu bằng `#` sẽ bị bỏ qua.

```
# Một private key mỗi dòng
0xabc123...
0xdef456...
```

### `proxy.txt`

Thêm proxy của bạn (mỗi dòng 1 proxy). Proxy được gán round-robin cho từng tài khoản. Nếu số proxy ít hơn số tài khoản, mẫu sẽ lặp lại.

```
# Các định dạng được hỗ trợ:
http://user:pass@host:port
https://user:pass@host:port
socks5://host:port
```

---

## Sử dụng

Khởi chạy bot ở chế độ tương tác:

```bash
node bot.js
# hoặc
npm start
```

Bạn sẽ thấy menu tương tác:

```
[ MENU ] ══════════════════════════════════
[1] Kiểm tra trạng thái SP
[2] Phê duyệt Token
[3] Farm Volume (Swap tự động)
[4] Chạy tất cả tính năng
[ ? ] Chọn tùy chọn :
```

### Các tùy chọn menu

| Tùy chọn | Mô tả                                                                                               |
|----------|------------------------------------------------------------------------------------------------------|
| `1`      | Kiểm tra điểm SP hiện tại, xếp hạng toàn cầu, tổng số giao dịch, tổng volume và SP hôm nay của từng tài khoản đã nạp. |
| `2`      | Kiểm tra và (nếu cần) phê duyệt hợp đồng Router sử dụng stablecoin thay mặt cho từng tài khoản.     |
| `3`      | Chạy vòng lặp farm volume tự động: lấy trạng thái, tính toán số swap cần thiết để đạt hạn mức ngày, rồi thực thi. |
| `4`      | Chạy tùy chọn 1 → 2 → 3 theo thứ tự trong một lệnh.                                                 |

### Ví dụ quy trình

```bash
node bot.js
# Chọn "4" để phê duyệt token và bắt đầu farm trong một lệnh duy nhất
```

---

## Thiết lập Proxy

Sử dụng proxy rất được khuyến nghị để tránh giới hạn tốc độ khi truy vấn API Stabilizer và phân tán tải RPC.

### Các định dạng được hỗ trợ

Bot hỗ trợ 3 định dạng proxy:

- **HTTP:** `http://127.0.0.1:8080`
- **HTTPS:** `https://user:pass@proxy.example.com:443`
- **SOCKS5:** `socks5://127.0.0.1:1080`

### Phân phối round-robin

Mỗi tài khoản được gán proxy dựa trên chỉ số của nó trong `accounts.txt` modulo số lượng proxy trong `proxy.txt`.

```
accounts: [A1, A2, A3, A4]
proxies : [P1, P2]

A1 → P1, A2 → P2, A3 → P1, A4 → P2
```

### Nhà cung cấp được đề xuất

- [Smartproxy](https://smartproxy.com/)
- [Bright Data](https://brightdata.com/)
- [IPRoyal](https://iproyal.com/)

---

## Cách hoạt động

### Kiểm tra trạng thái SP

Bot truy vấn `https://app.stabilizer.finance/api/zpoints/user/{wallet}` và trích xuất:
- `totalPoints` (tổng SP)
- `rank` (thứ hạng bảng xếp hạng toàn cầu)
- `totalTrades` (số giao dịch lịch sử)
- `totalVolume` (khối lượng USD lịch sử)
- `todaySpEarned` (SP kiếm được hôm nay)

### Tính toán hạn mức ngày

```js
spRemaining  = DAILY_CAP - todaySpEarned;
volumeNeeded = spRemaining * 100; // khoảng 100 volume mỗi SP
swapsNeeded  = floor(volumeNeeded / SWAP_AMOUNT) + 1;
```

### Logic phê duyệt

Đối với mỗi stablecoin (USDT, USDC, USDS, PYUSD), bot:

1. Đọc allowance hiện tại `allowance(ví, AMM)`.
2. Nếu allowance thấp hơn số tiền swap dự kiến × 100, gửi giao dịch `approve(AMM, MaxUint256)`.
3. Nếu không, bỏ qua bước phê duyệt.

### Vòng lặp farm volume

Đối với mỗi vòng cần thiết:

1. **USDT → USDZ**
   Đọc số dư USDT, swap toàn bộ (hoặc `SWAP_AMOUNT`, lấy giá trị nhỏ hơn) sang USDZ qua Router.
2. Đợi 2 giây.
3. **USDZ → USDT**
   Đọc số dư USDZ, swap toàn bộ trở lại USDT.
4. Đợi 2 giây.
5. Mỗi 10 vòng, kiểm tra lại SP qua API. Nếu đã đạt hạn mức hôm nay, dừng lại.

Vòng khứ hồi này tạo ra volume cho cả hai nhánh.

---

## Khắc phục sự cố

### Lỗi kết nối RPC

- Kiểm tra `RPC_URL` có thể truy cập từ server của bạn.
- PublicNode có giới hạn tốc độ. Hãy cân nhắc dùng Infura / Alchemy / Ankr riêng.
- Nếu dùng proxy cho RPC, lưu ý hỗ trợ proxy của ethers v6 còn hạn chế; bạn có thể cần `JsonRpcProvider` tùy chỉnh với proxy negotiation.

### Lỗi "Không đủ tiền"

- Đảm bảo ví có cả **ETH Sepolia** (trả gas) và đủ stablecoin cho số lượng swap.
- Trên testnet, dùng faucet như [faucet.quicknode.com](https://faucet.quicknode.com/) hoặc [sepoliafaucet.com](https://sepoliafaucet.com/).

### Phê duyệt bị kẹt

- Nếu giao dịch phê duyệt đã được khai thác nhưng bot vẫn phê duyệt lại, kiểm tra bạn đang phê duyệt đúng địa chỉ chi tiêu (`AMM = 0xA3E...`).
- Một số token (ví dụ USDT trên một số mạng) không phê duyệt `MaxUint256`. Nếu gặp vấn đề, hãy giới hạn lượng phê duyệt theo một số tiền cụ thể.

### Lỗi API / Giới hạn tốc độ

- API Stabilizer có thể hạn chế tần suất yêu cầu. Bot đã thử lại 5 lần với delay 5 giây, nhưng hãy cân nhắc tăng backoff nếu bạn chạy nhiều tài khoản.
- Đăng ký endpoint hoặc API key riêng nếu có sẵn.

---

## Lưu ý bảo mật

- **Không bao giờ** commit `accounts.txt` chứa private key vào hệ thống quản lý phiên bản.
- Tập tin `.env` cũng nên giữ cục bộ và không theo dõi.
- Dùng key chỉ đọc hoặc quỹ thử nghiệm chỉ cho testnet.
- Proxy có xác thực (`user:pass`) được hỗ trợ nhưng được truyền dạng plaintext nếu lưu trong `proxy.txt`. Hãy cân nhắc công cụ quản lý secret (biến môi trường, Vault...) cho môi trường production.
- Bot này chỉ dùng cho **testnet**. Việc sử dụng trái phép trên mainnet có thể vi phạm điều khoản dịch vụ.

---

## Đóng góp

Đóng góp luôn được chào đón!

1. Fork repository.
2. Tạo nhánh tính năng (`git checkout -b feature/tinh-nang-tuyet-voi`).
3. Commit thay đổi (`git commit -m 'Thêm tính năng tuyệt vời'`).
4. Đẩy lên nhánh (`git push origin feature/tinh-nang-tuyet-voi`).
5. Mở Pull Request.

---

## Giấy phép

MIT License. Xem `LICENSE` để biết chi tiết.

---
