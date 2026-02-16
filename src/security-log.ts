/**
 * Security Event Audit Logging
 *
 * Provides structured logging for security-relevant events to support:
 * - Compliance auditing (SOC 2, ISO 27001)
 * - Security monitoring and alerting
 * - Incident response and forensics
 * - Operational analytics
 *
 * Implementation Notes:
 * - Logs to stderr (stdout reserved for MCP protocol communication)
 * - JSON format for machine readability and SIEM integration
 * - ISO 8601 timestamps for log aggregation
 * - Non-blocking operation
 *
 * @module security-log
 */

/**
 * Security event types categorized by domain
 */
export type SecurityEventType =
  // Access Control Events
  | "budget_exceeded"
  | "rate_limit_exceeded"
  // Configuration Validation Events
  | "wallet_path_violation"
  | "api_base_violation"
  | "invalid_budget_config"
  // Resource Management Events
  | "large_upload_blocked"
  // Business/Operational Events
  | "api_call_paid"
  | "store_created"
  | "withdrawal_requested"
  | "token_launched"
  | "token_traded";

/**
 * Structured security event log entry
 */
export interface SecurityEvent {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Event type identifier */
  event: SecurityEventType;
  /** Event-specific contextual data */
  details: Record<string, unknown>;
}

/**
 * Log a security-relevant event for audit trail
 *
 * Events are written to stderr in JSON format for:
 * - Log aggregation systems (Datadog, Splunk, ELK)
 * - SIEM platforms
 * - Compliance reporting
 *
 * @param event - Event type identifier
 * @param details - Event-specific contextual information
 *
 * @example
 * ```typescript
 * logSecurityEvent("budget_exceeded", {
 *   type: "daily",
 *   currentSpent: 48.50,
 *   limit: 50.00,
 *   attemptedAmount: 2.00
 * });
 * ```
 */
export function logSecurityEvent(
  event: SecurityEventType,
  details: Record<string, unknown> = {}
): void {
  const entry: SecurityEvent = {
    timestamp: new Date().toISOString(),
    event,
    details,
  };

  // Write to stderr (stdout is MCP protocol channel)
  // Using console.error for non-blocking write
  console.error(JSON.stringify(entry));
}
