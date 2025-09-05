/**
 * Orchestration Security Middleware - Comprehensive security framework for structured prompt generation
 * Provides API key management, data sanitization, threat detection, and secure handling
 * Addresses SECURITY1, SECURITY2, SECURITY3 test cases
 */

/**
 * Threat types that can be detected in prompts and requests
 */
export enum ThreatType {
  PROMPT_INJECTION = 'prompt_injection',
  DATA_EXFILTRATION = 'data_exfiltration',
  API_ABUSE = 'api_abuse',
  RESOURCE_EXHAUSTION = 'resource_exhaustion',
  SENSITIVE_DATA_EXPOSURE = 'sensitive_data_exposure',
}

/**
 * Security severity levels for threat assessment
 */
export enum SecuritySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Security actions that can be recommended or taken
 */
export enum SecurityAction {
  ALLOW = 'allow',
  BLOCK = 'block',
  SANITIZE = 'sanitize',
  MONITOR = 'monitor',
  ESCALATE = 'escalate',
}

/**
 * Time periods for security metrics analysis
 */
export enum TimePeriod {
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

/**
 * Orchestration request structure for security validation
 */
export interface OrchestrationRequest {
  prompt: string
  sessionId: string
  userId?: string
  clientId?: string
  timestamp: number
  metadata?: Record<string, unknown>
}

/**
 * Detailed threat assessment information
 */
export interface ThreatAssessment {
  type: ThreatType
  severity: SecuritySeverity
  description: string
  indicators: ThreatIndicator[]
  recommendedAction: SecurityAction
  confidence: number
  pattern?: string
}

/**
 * Individual threat indicators found in content
 */
export interface ThreatIndicator {
  pattern: string
  location: number
  matchedText: string
  severity: SecuritySeverity
}

/**
 * Security mitigation measures
 */
export interface SecurityMitigation {
  action: SecurityAction
  description: string
  automated: boolean
  impactLevel: SecuritySeverity
}

/**
 * Audit entry for security events
 */
export interface AuditEntry {
  timestamp: number
  sessionId: string
  eventType: string
  userId?: string
  clientId?: string
  details: Record<string, unknown>
  riskScore: number
}

/**
 * Security validation result
 */
export interface SecurityValidationResult {
  allowed: boolean
  threats: ThreatAssessment[]
  mitigations: SecurityMitigation[]
  riskScore: number
  auditTrail: AuditEntry
  sanitizedPrompt?: string
}

/**
 * Sanitized prompt with security information
 */
export interface SanitizedPrompt {
  sanitizedPrompt: string
  modificationsApplied: SecurityModification[]
  securityScore: number
  threatAssessment: ThreatAssessmentSummary
  originalLength: number
  sanitizedLength: number
}

/**
 * Security modifications applied during sanitization
 */
export interface SecurityModification {
  type: string
  location: number
  originalText: string
  replacementText: string
  reason: string
  severity: SecuritySeverity
}

/**
 * Threat assessment summary
 */
export interface ThreatAssessmentSummary {
  clean: boolean
  confidence: number
  threatsFound: number
  highestSeverity: SecuritySeverity
}

/**
 * API key operation types
 */
export enum APIKeyOperationType {
  RETRIEVE = 'retrieve',
  ROTATE = 'rotate',
  VALIDATE = 'validate',
  REVOKE = 'revoke',
}

/**
 * API key operation request
 */
export interface APIKeyOperation {
  type: APIKeyOperationType
  service: string
  operation: string
  sessionId: string
  metadata?: Record<string, unknown>
}

/**
 * API key operation result
 */
export interface APIKeyResult {
  success: boolean
  keyId?: string
  expiresAt?: number
  permissions?: string[]
  error?: string
  auditTrail: AuditEntry
}

/**
 * Session data for cleanup operations
 */
export interface SessionData {
  sessionId: string
  userId?: string
  createdAt: number
  lastAccessedAt: number
  temporaryData: TemporaryDataItem[]
  sensitiveOperations: SensitiveOperation[]
}

/**
 * Individual temporary data item
 */
export interface TemporaryDataItem {
  id: string
  type: string
  data: unknown
  createdAt: number
  expiresAt: number
  sensitive: boolean
  encrypted: boolean
}

/**
 * Sensitive operations tracking
 */
export interface SensitiveOperation {
  operationId: string
  type: string
  timestamp: number
  dataInvolved: string[]
  auditRequired: boolean
}

/**
 * Cleanup operation result
 */
export interface CleanupResult {
  success: boolean
  itemsRemoved: number
  dataSize: number
  securelyDeleted: boolean
  errors?: string[]
  auditTrail: AuditEntry
}

/**
 * Security event for audit logging
 */
export interface SecurityEvent {
  eventId: string
  type: string
  severity: SecuritySeverity
  timestamp: number
  sessionId: string
  userId?: string
  description: string
  details: Record<string, unknown>
  automated: boolean
  responseAction?: SecurityAction
}

/**
 * Security metrics for monitoring
 */
export interface SecurityMetrics {
  period: TimePeriod
  totalRequests: number
  threatsDetected: number
  threatsBlocked: number
  riskScoreAverage: number
  topThreatTypes: Array<{ type: ThreatType; count: number }>
  apiKeyRotations: number
  dataCleanupOperations: number
  securityIncidents: number
  recommendations: string[]
}

/**
 * Main orchestration security middleware interface
 */
export interface OrchestrationSecurityMiddleware {
  /**
   * Validate incoming request for security threats
   */
  validateRequest(request: OrchestrationRequest): Promise<SecurityValidationResult>

  /**
   * Sanitize prompt data to remove security threats
   */
  sanitizePromptData(prompt: string): Promise<SanitizedPrompt>

  /**
   * Manage API key operations with security controls
   */
  manageAPIKeys(operation: APIKeyOperation): Promise<APIKeyResult>

  /**
   * Clean up temporary data securely
   */
  cleanupTemporaryData(session: SessionData): Promise<CleanupResult>

  /**
   * Audit security events
   */
  auditSecurityEvent(event: SecurityEvent): Promise<void>

  /**
   * Get security metrics for monitoring
   */
  getSecurityMetrics(period: TimePeriod): Promise<SecurityMetrics>

  /**
   * Initialize security middleware with configuration
   */
  initialize(config: SecurityConfiguration): Promise<void>

  /**
   * Shutdown security middleware and cleanup resources
   */
  shutdown(): Promise<void>
}

/**
 * Security configuration options
 */
export interface SecurityConfiguration {
  apiKeyRotationInterval: number // in milliseconds
  dataRetentionPeriod: number // in milliseconds
  threatDetectionEnabled: boolean
  auditLoggingEnabled: boolean
  encryptionEnabled: boolean
  maxRiskScore: number
  alertThresholds: SecurityAlertThresholds
}

/**
 * Security alert thresholds
 */
export interface SecurityAlertThresholds {
  highRiskScore: number
  criticalThreatDetection: number
  suspiciousActivityRate: number
  dataExfiltrationAttempts: number
}
