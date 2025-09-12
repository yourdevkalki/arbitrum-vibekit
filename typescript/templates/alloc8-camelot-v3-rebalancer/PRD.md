# PRD — Camelot v3 LP Rebalancing Agent for Vibekit

## 1. Overview

The **Camelot v3 LP Rebalancing Agent** is a reusable Vibekit agent template that automates liquidity management for **concentrated liquidity pools on Camelot v3**.

The agent dynamically adjusts LP ranges using a **quantitative strategy**, supports **user-configurable risk profiles**, and operates in either:

* **Active Mode** → Automatically executes rebalance transactions on-chain.
* **Passive Mode** → Evaluates conditions and sends rebalance notifications only.

This PRD defines functionality, architecture, workflows, and technical implementation details for the first version.

---

## 2. Goals

* Provide a **reference implementation** of a DeFi automation agent using Vibekit.
* Enable **risk-adjusted LP rebalancing** strategies (low/medium/high).
* Demonstrate **integration with Vibekit’s MCP tools** for pool queries, execution, and monitoring.
* Support both **hands-off autonomous execution (Active)** and **alert-only guidance (Passive)**.
* Serve as a **community template** for building protocol-specific agents.

---

## 3. Features

### Core Features

* **Supports Camelot v3 concentrated liquidity pools** (ETH/USDC, others).
* **Risk Profiles** (Low, Medium, High) → pre-configured strategy params:

  * Range width %
  * Volatility sensitivity
  * Rebalance threshold
* **Data Integration via Vibekit MCP Server**:

  * Pool state queries (price, liquidity, volume).
  * Historical + live price data.
  * On-chain liquidity provision & withdrawal.
* **Rebalance Engine**:

  * Monitors pool drift and volatility.
  * Calculates optimal new range.
  * Executes or alerts depending on mode.
* **Operational Modes**:

  * Passive → fetch, evaluate, notify user.
  * Active → fetch, evaluate, execute rebalance automatically.
* **Logging & Tracking**:

  * Rebalance events.
  * Fee income.
  * APR before/after.

---

## 4. Architecture

### High-Level Flow

```
User Configs → Agent → MCP Server → Strategy Engine → MCP Server Execution → Logging
```

### Components

1. **Agent Core (typescript/templates/alloc8-camelot-v3-rebalancer)**

   * Runs as a Vibekit agent.
   * Handles configs, task orchestration, mode selection.

2. **Config Store**

   * User-provided configs (wallet, pool ID, risk profile, thresholds).
   * Stored either:

     * Inside A2A Task persistence.
     * Or external lightweight JSON/YAML config store.

3. **MCP Tool Integration**

   * Pool queries.
   * Price & volatility metrics.
   * Liquidity provision/withdraw execution.

4. **Strategy Module**

   * Quantitative algo that:

     * Reads risk profile.
     * Calculates optimal tick ranges.
     * Triggers rebalance when deviation/volatility > threshold.

5. **Execution Layer**

   * In Active Mode:

     * Uses wallet credentials (user-supplied private key for v1).
     * Signs & sends burn/mint tx via MCP.
   * In Passive Mode:

     * Sends notification/alert only.

6. **Logging & Monitoring**

   * Local or persistent store.
   * Tracks:

     * Rebalances performed/suggested.
     * Fee income collected.
     * APR evolution.

---

## 5. Workflows

### Initialization

1. User selects **pool ID, tokens, risk profile, wallet, mode**.
2. Agent loads configs.
3. MCP connection established.

### Rebalance Cycle

1. **Fetch Pool Data**: Price, liquidity depth, volatility (MCP).
2. **Calculate Optimal Range** (Strategy).
3. **Decision**:

   * Passive → send alert.
   * Active → withdraw old LP position, deposit new one.
4. **Log**: Action details, APR changes, fees.
5. **Repeat**: Continuous monitoring loop.

---

## 6. Technical Requirements

### Dependencies

* **Vibekit Framework** (typescript agents).
* **A2A SDK + Tasks** for scheduling + mode separation:

  * Passive Mode Task.
  * Active Mode Task.
* **Camelot v3 smart contracts** (via MCP).
* **Typescript** code in `typescript/templates/alloc8-camelot-v3-rebalancer`.

### Wallet Architecture (v1)

* User supplies **private key** for signing transactions.
* Transactions are relayed via MCP Execution layer.
* Future: support safer options (e.g., delegated signer, MPC).

### Risk Profile Parameters

| Profile | Range Width    | Rebalance Sensitivity      | Volatility Factor |
| ------- | -------------- | -------------------------- | ----------------- |
| Low     | Wide (10-20%)  | Low (rebalance rarely)     | Low weight        |
| Medium  | Medium (5-10%) | Medium                     | Medium weight     |
| High    | Narrow (2-5%)  | High (frequent rebalances) | High weight       |

---

## 7. Example Use Case

* LP selects **ETH/USDC pool** with **Medium Risk** profile.
* Agent:

  1. Opens position with 5–10% range around mid price.
  2. Monitors pool data every N minutes.
  3. Detects deviation > threshold.
  4. Withdraws + redeploys liquidity.
  5. Logs new APR + fee accrual.

---

## 8. Open Questions

* **Config persistence**: Should configs live inside A2A Tasks (recommended) or external store?
* **Execution safety**: Should Active Mode always use private key, or should we introduce key abstraction (e.g. safe)?
* **Notification method**: Should Passive Mode notify via console, webhook, or integrated Vibekit notifier?

---

## 9. Deliverables

1. **Code**: `typescript/templates/alloc8-camelot-v3-rebalancer`

   * Agent implementation (Passive + Active).
   * Strategy module.
   * MCP integrations.

2. **Docs**:

   * README with setup instructions.
   * Example configs (ETH/USDC medium risk).

3. **Demo**:

   * Passive mode run (console/log alerts).
   * Active mode run (testnet tx execution).

---

## 10. Impact

* Expands Vibekit with a **practical LP automation template**.
* Provides LPs with a **risk-adjusted yield tool**.
* Demonstrates **end-to-end MCP + Vibekit integration**.
* Encourages community contributions for new protocols/strategies.

