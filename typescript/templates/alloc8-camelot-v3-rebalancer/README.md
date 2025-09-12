# Camelot v3 LP Rebalancing Agent

An automated liquidity management agent for Camelot v3 concentrated liquidity pools, built with the Vibekit v2 framework. This agent provides intelligent rebalancing strategies with risk-based position management and continuous monitoring capabilities.

**📚 Learn the architecture**: This agent demonstrates advanced multi-skill patterns and automated DeFi strategies using the Vibekit v2 framework with MCP tool integration.

## Features

### Skills

- **Pool Analytics**: Comprehensive analysis of Camelot v3 pools including liquidity distribution, volatility metrics, and fee performance
- **Position Management**: Full lifecycle management of concentrated liquidity positions (mint, burn, collect fees, rebalance)
- **Rebalancing Monitor**: Automated monitoring with active execution or passive alerting modes

### Key Capabilities

- **Risk-Based Strategies**: Three risk profiles (low/medium/high) with customizable parameters
- **Automated Monitoring**: Continuous position monitoring with drift detection
- **Dual Operating Modes**:
  - **Active Mode**: Automatically executes profitable rebalances
  - **Passive Mode**: Sends alerts and recommendations only
- **Comprehensive Analytics**: Pool performance metrics, volatility analysis, and fee optimization
- **Multi-Pool Support**: Monitor and manage positions across multiple Camelot v3 pools

### Architecture

- **Skills-based**: Each capability is a separate skill with focused tools
- **LLM Orchestration**: AI automatically routes to appropriate tools and coordinates complex workflows
- **MCP Integration**: Uses Ember API for seamless Camelot v3 protocol interactions
- **Modern Transport**: StreamableHTTP with legacy SSE backwards compatibility

## Quick Start

### Prerequisites

- Node.js 18+ or Docker
- At least one AI provider API key
- Access to Arbitrum network

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Configure your API keys and settings
vim .env
```

### Environment Configuration

```bash
# AI Provider (choose one or more)
OPENROUTER_API_KEY=your-openrouter-api-key
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
XAI_API_KEY=your-xai-api-key
HYPERBOLIC_API_KEY=your-hyperbolic-api-key

# Optional: Choose provider (defaults to first available)
AI_PROVIDER=openrouter  # openrouter | openai | anthropic | xai | hyperbolic

# Optional: Specify model (defaults to provider-specific model)
AI_MODEL=google/gemini-2.5-flash

# Network Configuration
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
EMBER_MCP_SERVER_URL=https://api.emberai.xyz/mcp

# Optional: Enhanced RPC access
QUICKNODE_SUBDOMAIN=your-subdomain
QUICKNODE_API_KEY=your-api-key
```

### Running the Agent

```bash
# Development mode
pnpm dev

# Production build and run
pnpm build
pnpm start

# Docker
pnpm docker:build
pnpm docker:run
```

The agent will start on `http://localhost:3001` by default.

## Usage Examples

### Pool Analytics

```
"Analyze my ETH/USDC pool performance over the last 24 hours"
"Calculate volatility for WETH/ARB pool to determine optimal range"
"Show fee collection metrics for all my positions"
```

### Position Management

```
"Mint a new ETH/USDC position with medium risk profile"
"Rebalance my WETH/ARB position based on current market conditions"
"Collect fees from position #12345"
"Burn my underperforming USDC/DAI position"
```

### Automated Monitoring

```
"Start monitoring all my positions in passive mode with high risk profile"
"Begin active monitoring for ETH/USDC pool with 5-minute intervals"
"Check if any of my positions need rebalancing"
"Stop monitoring and show performance summary"
```

## Risk Profiles

### Low Risk

- **Range Multiplier**: 2.0x (wider ranges)
- **Rebalance Threshold**: 80% (rebalance when 80% out of range)
- **Volatility Threshold**: 20%
- **Max Slippage**: 0.5%

### Medium Risk

- **Range Multiplier**: 1.5x (moderate ranges)
- **Rebalance Threshold**: 70%
- **Volatility Threshold**: 35%
- **Max Slippage**: 1.0%

### High Risk

- **Range Multiplier**: 1.2x (tight ranges)
- **Rebalance Threshold**: 60%
- **Volatility Threshold**: 50%
- **Max Slippage**: 2.0%

## Operating Modes

### Active Mode

- Automatically executes rebalances when profitable
- Requires wallet connection and transaction signing
- Maximizes yield through optimal range management
- Includes safety checks and slippage protection

### Passive Mode

- Monitors positions and sends alerts/recommendations
- No automatic transaction execution
- Perfect for users who want manual control
- Provides detailed analysis and suggested actions

## Agent Capabilities

The agent exposes an MCP-compatible interface with the following capabilities:

### Pool Analytics Skill

- `get-pool-data`: Fetch comprehensive pool information
- `analyze-pool-metrics`: Detailed performance analysis
- `calculate-volatility`: Volatility metrics for range optimization

### Position Management Skill

- `mint-position`: Create new concentrated liquidity positions
- `burn-position`: Remove liquidity positions
- `collect-fees`: Collect accumulated trading fees
- `rebalance-position-workflow`: Complete rebalancing workflow

### Rebalancing Monitor Skill

- `start-monitoring`: Begin automated monitoring
- `stop-monitoring`: Stop monitoring with summary
- `check-rebalance-need`: Assess rebalancing opportunities
- `execute-rebalance-workflow`: Automated rebalancing execution

## API Integration

This agent integrates with the Ember MCP Server for Camelot v3 operations:

- **Endpoint**: `https://api.emberai.xyz/mcp`
- **Protocols**: Camelot DEX concentrated liquidity
- **Networks**: Arbitrum One (with Orbit chain support planned)

## Development

### Project Structure

```
src/
├── index.ts              # Agent entry point
├── config.ts             # Agent configuration
├── skills/               # High-level capabilities
│   ├── poolAnalytics.ts
│   ├── positionManagement.ts
│   └── rebalancingMonitor.ts
├── tools/                # Specific actions
│   ├── getPoolData.ts
│   ├── mintPosition.ts
│   ├── startMonitoring.ts
│   └── ...
└── context/              # Shared state and types
    ├── provider.ts
    └── types.ts
```

### Testing

```bash
# Run tests
pnpm test

# Watch mode
pnpm test:watch

# Build and test
pnpm build && pnpm test
```

### Docker Deployment

```bash
# Build production image
pnpm docker:build

# Run with Docker Compose
pnpm docker:compose:up

# Stop services
pnpm docker:compose:down
```

## Advanced Configuration

### Custom Risk Profiles

You can customize risk profiles by modifying the context provider or creating additional configuration options:

```typescript
const customRiskProfile: RiskProfile = {
  name: 'custom',
  volatilityThreshold: 0.4,
  rebalanceThreshold: 0.65,
  rangeMultiplier: 1.3,
  maxSlippage: 0.015,
};
```

### Monitoring Intervals

Adjust monitoring frequency based on your needs:

- **High-frequency trading**: 30-60 seconds
- **Active management**: 5-15 minutes
- **Conservative approach**: 30-60 minutes

## Troubleshooting

### Common Issues

1. **MCP Connection Failed**
   - Check `EMBER_MCP_SERVER_URL` configuration
   - Verify network connectivity
   - Ensure Ember API is accessible

2. **Position Not Found**
   - Verify wallet address is correct
   - Check if position exists on Camelot v3
   - Ensure proper network connection

3. **Transaction Failures**
   - Check gas settings and network congestion
   - Verify token approvals
   - Ensure sufficient balance for operations

### Debug Mode

Enable debug logging:

```bash
DEBUG=camelot-rebalancer:* pnpm dev
```

## Roadmap

- [ ] Historical performance tracking
- [ ] Advanced volatility models (GARCH, EWMA)
- [ ] Multi-chain support (Orbit chains)
- [ ] Portfolio-level rebalancing strategies
- [ ] Integration with yield farming protocols
- [ ] Mobile notifications and alerts
- [ ] Web dashboard for monitoring

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests for any improvements.

## License

This project is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.

## Support

For support and questions:

- Create an issue in the repository
- Join our Discord community
- Check the Vibekit documentation

---

**⚠️ Disclaimer**: This is experimental software for automated DeFi operations. Always test thoroughly and understand the risks before using with real funds. The authors are not responsible for any financial losses.
