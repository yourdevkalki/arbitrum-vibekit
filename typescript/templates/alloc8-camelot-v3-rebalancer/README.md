# Camelot v3 LP Rebalancing Agent

An automated liquidity position rebalancing agent for Camelot v3 concentrated liquidity pools. This agent dynamically adjusts liquidity ranges using quantitative algorithms and supports both **Active Mode** (auto-execution) and **Passive Mode** (alert-only).

## 🎯 Features

- **Automated Rebalancing**: Dynamically adjusts LP ranges based on market conditions
- **Auto-Discovery**: Automatically fetches and monitors all active LP positions from wallet
- **Multi-Chain Support**: Monitor positions across multiple chains (Arbitrum, Ethereum, etc.)
- **Risk Management**: User-selectable risk profiles (low, medium, high)
- **Dual Operating Modes**:
  - **Passive Mode**: Monitors positions and sends alerts via Telegram
  - **Active Mode**: Automatically executes rebalances on-chain
- **Flexible Discovery Modes**:
  - **Auto-Discover**: Monitor all wallet positions across specified chains
  - **Single-Pool**: Focus on a specific pool address
- **Real-time Monitoring**: Configurable check intervals (default: 1 hour)
- **Comprehensive Analytics**: APR tracking, fee calculations, and position health scoring
- **Telegram Integration**: Rich notifications for alerts and confirmations
- **Production Ready**: Docker support, health endpoints, and structured logging

## 🏗 Architecture

### Core Components

1. **A2A Tasks**: Scheduled tasks for passive/active monitoring
2. **MCP Tools**: Blockchain interaction tools via Ember API
3. **Strategy Engine**: Volatility calculation and range optimization
4. **Notification System**: Telegram bot integration
5. **Skills**: High-level capabilities exposed via the v2 framework

### Skills Available

- **LP Rebalancing**: Analyze and rebalance concentrated liquidity positions
- **Monitoring Control**: Start, stop, and check status of automated monitoring

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- At least one AI provider API key (OpenAI, Anthropic, etc.)
- Wallet private key for transaction signing
- (Optional) Telegram bot for notifications

### Installation

1. **Clone and navigate to the template**:

   ```bash
   cd typescript/templates/alloc8-camelot-v3-rebalancer
   ```

2. **Install dependencies**:

   ```bash
   pnpm install
   ```

3. **Configure environment**:

   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

4. **Build the agent**:

   ```bash
   pnpm build
   ```

5. **Start the agent**:
   ```bash
   pnpm start
   ```

## ⚙️ Configuration

### Position Discovery Modes

The agent supports two discovery modes:

#### 1. Auto-Discovery Mode (Recommended)

Automatically fetches and monitors **all active LP positions** from your wallet across multiple chains:

```bash
# Discovery Configuration
DISCOVERY_MODE=auto-discover
CHAIN_IDS=42161,1              # Arbitrum and Ethereum

# AI Provider (at least one required)
OPENAI_API_KEY=your_openai_api_key_here

# Wallet
WALLET_PRIVATE_KEY=your_wallet_private_key_here
```

**Benefits:**

- No need to manually specify pool addresses
- Monitors all your positions automatically
- Multi-chain support
- Scales with your portfolio

#### 2. Single-Pool Mode

Focus monitoring on a specific pool:

```bash
# Discovery Configuration
DISCOVERY_MODE=single-pool
POOL_ID=0x...                  # Specific Camelot v3 pool address
TOKEN_0=ETH                    # First token symbol
TOKEN_1=USDC                   # Second token symbol

# AI Provider (at least one required)
OPENAI_API_KEY=your_openai_api_key_here

# Wallet
WALLET_PRIVATE_KEY=your_wallet_private_key_here
```

### Required Environment Variables

```bash
# AI Provider (at least one required)
OPENAI_API_KEY=your_openai_api_key_here

# Wallet
WALLET_PRIVATE_KEY=your_wallet_private_key_here

# Discovery Mode
DISCOVERY_MODE=auto-discover    # or single-pool
```

### Optional Configuration

```bash
# Operating Mode
REBALANCER_MODE=passive  # passive or active
RISK_PROFILE=medium      # low, medium, or high
CHECK_INTERVAL=3600000   # 1 hour in milliseconds

# Telegram Notifications
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# Thresholds
PRICE_DEVIATION_THRESHOLD=0.05    # 5%
UTILIZATION_THRESHOLD=0.8         # 80%
```

### Risk Profiles

| Profile    | Range Width | Rebalance Threshold | Max Slippage | Min Position |
| ---------- | ----------- | ------------------- | ------------ | ------------ |
| **Low**    | 2.0x        | 15%                 | 0.5%         | $1,000       |
| **Medium** | 1.5x        | 10%                 | 1.0%         | $500         |
| **High**   | 1.0x        | 5%                  | 2.0%         | $100         |

## 📖 Usage

### Starting Monitoring

Once the agent is running, you can interact with it via MCP calls:

```json
{
  "method": "tools/call",
  "params": {
    "name": "startMonitoring",
    "arguments": {
      "action": "start",
      "mode": "passive"
    }
  }
}
```

### Checking Status

```json
{
  "method": "tools/call",
  "params": {
    "name": "getMonitoringStatus",
    "arguments": {
      "action": "status"
    }
  }
}
```

### Manual Rebalancing

```json
{
  "method": "tools/call",
  "params": {
    "name": "getWalletLiquidityPositions",
    "arguments": {
      "walletAddress": "0x...",
      "poolAddress": "0x..."
    }
  }
}
```

#### Auto-Discovery Tool

Use the new `fetchWalletPositions` tool to automatically discover all active positions:

```json
{
  "method": "tools/call",
  "params": {
    "name": "fetchWalletPositions",
    "arguments": {
      "chainIds": [42161, 1],
      "activeOnly": true
    }
  }
}
```

**Response includes:**

- Position details with enhanced metadata
- Token symbols and decimals
- Current price and price ranges
- Position utilization rates
- Summary statistics across all chains

## 🤖 A2A Tasks

### Passive Mode Task

- Monitors LP positions every hour (configurable)
- Evaluates rebalance needs using quantitative algorithms
- Sends Telegram alerts when rebalancing is recommended
- Provides detailed analysis and APR improvement estimates

### Active Mode Task

- Performs same monitoring as Passive Mode
- Automatically executes rebalances when triggered
- Handles multi-step workflows:
  1. Withdraw current liquidity
  2. Swap tokens if needed for optimal ratio
  3. Supply liquidity at new optimal range
- Sends confirmation notifications with transaction hashes

## 🧮 Strategy Algorithm

### Volatility Calculation

1. **Historical Volatility**: Based on 24h price changes
2. **Implied Volatility**: Derived from pool volume/TVL ratio
3. **Combined Volatility**: Weighted average with confidence scoring

### Range Optimization

1. Calculate optimal range width based on volatility and risk profile
2. Convert price ranges to tick ranges (Uniswap v3 compatible)
3. Apply tick spacing constraints for Camelot v3

### Rebalance Triggers

- Position out of range
- Price deviation exceeds threshold
- Low liquidity utilization (<30%)
- Configurable thresholds per risk profile

## 🔔 Telegram Integration

### Setup Telegram Bot

1. Create a bot with [@BotFather](https://t.me/BotFather)
2. Get your bot token
3. Get your chat ID (message the bot, then visit: `https://api.telegram.org/bot<TOKEN>/getUpdates`)
4. Add to your `.env`:
   ```bash
   TELEGRAM_BOT_TOKEN=your_bot_token
   TELEGRAM_CHAT_ID=your_chat_id
   ```

### Notification Types

- **Rebalance Alerts** (Passive Mode)
- **Rebalance Confirmations** (Active Mode)
- **Error Notifications**
- **System Status Updates**

## 🐳 Docker Deployment

### Development

```bash
docker build -t camelot-rebalancer .
docker run --env-file .env -p 3001:3001 camelot-rebalancer
```

### Production

```bash
docker build -f Dockerfile.prod -t camelot-rebalancer:prod .
docker run --env-file .env -p 3001:3001 camelot-rebalancer:prod
```

## 🧪 Testing

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run with coverage
pnpm test --coverage
```

## 📊 Monitoring & Observability

### Health Endpoints

- `GET /health` - Basic health check
- `GET /.well-known/agent.json` - Agent card with capabilities

### Logging

Structured logging with different levels:

- **Info**: Normal operations, rebalance decisions
- **Warn**: Configuration issues, fallback actions
- **Error**: Failed transactions, API errors

### Metrics

The agent tracks:

- Rebalance frequency and success rate
- APR improvements achieved
- Gas costs and slippage
- Position health scores over time

## 🔒 Security Considerations

### Private Key Management

- Store private keys securely in environment variables
- Consider using hardware wallets or MPC solutions for production
- Never commit private keys to version control

### Risk Management

- Start with Passive Mode to understand behavior
- Use appropriate risk profiles for your risk tolerance
- Monitor gas costs and slippage limits
- Set reasonable position size limits

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.

## 🆘 Support

For issues and questions:

1. Check the [troubleshooting guide](#troubleshooting)
2. Review existing [GitHub issues](https://github.com/your-repo/issues)
3. Create a new issue with detailed information

## 🔧 Troubleshooting

### Common Issues

**Agent won't start**

- Check all required environment variables are set
- Verify AI provider API key is valid
- Ensure wallet private key format is correct

**No positions found**

- Verify `POOL_ID` matches your actual LP positions
- Check wallet address derivation from private key
- Confirm you have positions in the specified pool

**Telegram notifications not working**

- Verify bot token and chat ID are correct
- Ensure the bot can send messages to your chat
- Check bot permissions and chat settings

**Rebalancing fails**

- Check wallet has sufficient balance for gas
- Verify token approvals are in place
- Review slippage settings and market conditions

### Debug Mode

Enable detailed logging:

```bash
DEBUG=* pnpm start
```

### MCP Inspector

Inspect the agent's MCP interface:

```bash
pnpm run inspect:npx
```

## 🗺 Roadmap

- [ ] Multi-pool monitoring support
- [ ] Advanced ML-based strategies
- [ ] Cross-chain rebalancing
- [ ] Portfolio-level optimization
- [ ] Web dashboard for monitoring
- [ ] Smart contract wallet integration
- [ ] Historical performance analytics
