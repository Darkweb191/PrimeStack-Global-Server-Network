/**
 * PrimeStack Switch — Module Index
 *
 * Centralises all module exports. Import from here rather than
 * from individual module files when using services cross-module.
 *
 * Example:
 *   import { ledgerService, walletService } from '../modules/index.js'
 */

export * from "./ledger/ledger.module.js";
export * from "./wallet/wallet.module.js";
export * from "./transfer/transfer.module.js";
export * from "./terminal/terminal.module.js";
export * from "./merchant/merchant.module.js";
export * from "./routing/routing.module.js";
export * from "./iso8583/iso8583.module.js";
export * from "./switch-core/switch-core.module.js";
export * from "./fraud/fraud.module.js";
export * from "./treasury/treasury.module.js";
export * from "./monitoring/monitoring.module.js";
export * from "./notifications/notifications.module.js";
export * from "./admin/admin.module.js";
export * from "./network/network.module.js";
export * from "./api-gateway/api-gateway.module.js";
export * from "./swift-payout/swift-payout.service.js";
export * from "./pag/pag.module.js";
export * from "./developer-platform/developer-platform.module.js";
export * from "./governance/governance.module.js";
export * from "./intelligence/intelligence.module.js";
export * from "./s2s-engine/s2s-engine.module.js";
