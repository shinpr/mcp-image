// Comprehensive Verification Suite - REFACTOR Phase
// Optimized and enhanced verification framework with unified interface

import {
  APIContractValidator,
  type ContractValidationResult,
} from '../../documentation/apiContractValidation'
import {
  BackwardCompatibilityVerifier,
  type CompatibilityReport,
} from '../compatibility/backwardCompatibilityTest'
import { SystemIntegrationTester, type SystemTestResult } from '../final/systemIntegrationTest'
import {
  MigrationPathValidator,
  type MigrationValidationResult,
} from '../integration/migrationPathValidation'

export interface ComprehensiveVerificationOptions {
  includeCompatibilityTests: boolean
  includeMigrationTests: boolean
  includeContractValidation: boolean
  includeSystemIntegration: boolean
  timeoutMs: number
  parallelExecution: boolean
}

export interface VerificationSummary {
  overall: {
    passed: boolean
    score: number
    executionTime: number
    readyForProduction: boolean
  }
  compatibility: {
    passed: boolean
    score: number
    issues: string[]
  } | null
  migration: {
    passed: boolean
    validPaths: string[]
    recommendedPath: string
  } | null
  apiContract: {
    passed: boolean
    contractScore: number
    violations: string[]
  } | null
  systemIntegration: {
    passed: boolean
    testResolution: number
    performanceScore: number
    securityScore: number
  } | null
  recommendations: string[]
  criticalIssues: string[]
}

export class ComprehensiveVerificationSuite {
  private compatibilityVerifier: BackwardCompatibilityVerifier
  private migrationValidator: MigrationPathValidator
  private contractValidator: APIContractValidator
  private systemTester: SystemIntegrationTester

  constructor() {
    this.compatibilityVerifier = new BackwardCompatibilityVerifier()
    this.migrationValidator = new MigrationPathValidator()
    this.contractValidator = new APIContractValidator()
    this.systemTester = new SystemIntegrationTester()
  }

  async runComprehensiveVerification(
    options: Partial<ComprehensiveVerificationOptions> = {}
  ): Promise<VerificationSummary> {
    const config: ComprehensiveVerificationOptions = {
      includeCompatibilityTests: true,
      includeMigrationTests: true,
      includeContractValidation: true,
      includeSystemIntegration: true,
      timeoutMs: 120000, // 2 minutes
      parallelExecution: true,
      ...options,
    }

    const startTime = Date.now()

    try {
      const results = config.parallelExecution
        ? await this.runParallelVerification(config)
        : await this.runSequentialVerification(config)

      const executionTime = Date.now() - startTime
      return this.compileVerificationSummary(results, executionTime)
    } catch (error) {
      return this.handleVerificationError(error, Date.now() - startTime)
    }
  }

  private async runParallelVerification(config: ComprehensiveVerificationOptions): Promise<{
    compatibility?: CompatibilityReport
    migration?: MigrationValidationResult
    apiContract?: ContractValidationResult
    systemIntegration?: SystemTestResult
  }> {
    const promises: Promise<unknown>[] = []
    const resultKeys: string[] = []

    if (config.includeCompatibilityTests) {
      promises.push(
        this.runWithTimeout(
          () => this.compatibilityVerifier.verifyCompleteCompatibility(),
          config.timeoutMs / 4
        )
      )
      resultKeys.push('compatibility')
    }

    if (config.includeMigrationTests) {
      promises.push(
        this.runWithTimeout(
          () => this.migrationValidator.validateMigrationPaths(),
          config.timeoutMs / 4
        )
      )
      resultKeys.push('migration')
    }

    if (config.includeContractValidation) {
      promises.push(
        this.runWithTimeout(
          () => this.contractValidator.validateAPIContract(),
          config.timeoutMs / 4
        )
      )
      resultKeys.push('apiContract')
    }

    if (config.includeSystemIntegration) {
      promises.push(
        this.runWithTimeout(() => this.systemTester.runCompleteSystemTest(), config.timeoutMs / 2)
      )
      resultKeys.push('systemIntegration')
    }

    const results = await Promise.all(promises)

    return resultKeys.reduce(
      (acc, key, index) => {
        acc[key as keyof typeof acc] = results[index]
        return acc
      },
      {} as Record<string, unknown>
    )
  }

  private async runSequentialVerification(config: ComprehensiveVerificationOptions): Promise<{
    compatibility?: CompatibilityReport
    migration?: MigrationValidationResult
    apiContract?: ContractValidationResult
    systemIntegration?: SystemTestResult
  }> {
    const results: Record<string, unknown> = {}

    if (config.includeCompatibilityTests) {
      results['compatibility'] = await this.runWithTimeout(
        () => this.compatibilityVerifier.verifyCompleteCompatibility(),
        config.timeoutMs / 4
      )
    }

    if (config.includeMigrationTests) {
      results['migration'] = await this.runWithTimeout(
        () => this.migrationValidator.validateMigrationPaths(),
        config.timeoutMs / 4
      )
    }

    if (config.includeContractValidation) {
      results['apiContract'] = await this.runWithTimeout(
        () => this.contractValidator.validateAPIContract(),
        config.timeoutMs / 4
      )
    }

    if (config.includeSystemIntegration) {
      results['systemIntegration'] = await this.runWithTimeout(
        () => this.systemTester.runCompleteSystemTest(),
        config.timeoutMs / 2
      )
    }

    return results
  }

  private async runWithTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ])
  }

  private compileVerificationSummary(
    results: Record<string, unknown>,
    executionTime: number
  ): VerificationSummary {
    const summary: VerificationSummary = {
      overall: {
        passed: false,
        score: 0,
        executionTime,
        readyForProduction: false,
      },
      compatibility: null,
      migration: null,
      apiContract: null,
      systemIntegration: null,
      recommendations: [],
      criticalIssues: [],
    }

    // Process compatibility results
    if (results['compatibility']) {
      const compatibility = results['compatibility'] as CompatibilityReport
      summary.compatibility = {
        passed: compatibility.overallCompatible,
        score: this.calculateCompatibilityScore(compatibility),
        issues: compatibility.recommendedActions,
      }

      if (!compatibility.overallCompatible) {
        summary.criticalIssues.push('Backward compatibility issues detected')
      }
    }

    // Process migration results
    if (results['migration']) {
      const migration = results['migration'] as MigrationValidationResult
      summary.migration = {
        passed: migration.allPathsValid,
        validPaths: migration.migrationResults.filter((r) => r.successful).map((r) => r.scenario),
        recommendedPath: migration.recommendedPath,
      }

      if (!migration.allPathsValid) {
        summary.criticalIssues.push('Migration path validation failed')
      }
    }

    // Process API contract results
    if (results['apiContract']) {
      const apiContract = results['apiContract'] as ContractValidationResult
      summary.apiContract = {
        passed: apiContract.overallValid,
        contractScore: apiContract.contractScore,
        violations: this.extractContractViolations(apiContract),
      }

      if (!apiContract.overallValid) {
        summary.criticalIssues.push('API contract violations detected')
      }
    }

    // Process system integration results
    if (results['systemIntegration']) {
      const systemIntegration = results['systemIntegration'] as SystemTestResult
      summary.systemIntegration = {
        passed: systemIntegration.overallSuccess,
        testResolution: systemIntegration.testResolution.resolutionRate,
        performanceScore: systemIntegration.performanceTests.performanceScore,
        securityScore: systemIntegration.securityTests.securityScore,
      }

      if (!systemIntegration.overallSuccess) {
        summary.criticalIssues.push('System integration tests failed')
      }

      if (!systemIntegration.testResolution.allResolved) {
        summary.criticalIssues.push(
          `Only ${systemIntegration.testResolution.resolvedCount}/47 test cases resolved`
        )
      }
    }

    // Calculate overall metrics
    const scores = this.calculateOverallScores(results)
    summary.overall = {
      passed: summary.criticalIssues.length === 0,
      score: scores.overall,
      executionTime,
      readyForProduction: scores.overall >= 95 && summary.criticalIssues.length === 0,
    }

    // Generate recommendations
    summary.recommendations = this.generateRecommendations(summary)

    return summary
  }

  private calculateCompatibilityScore(compatibility: unknown): number {
    const report = compatibility as CompatibilityReport
    const apiScore = report.apiCompatibility.compatible ? 25 : 0
    const clientScore = report.clientCompatibility.overallScore * 0.25
    const dataScore = report.dataCompatibility ? 25 : 0
    const behaviorScore = report.behaviorCompatibility ? 25 : 0

    return apiScore + clientScore + dataScore + behaviorScore
  }

  private extractContractViolations(apiContract: ContractValidationResult): string[] {
    const violations: string[] = []

    if (!apiContract.protocolCompliance.compliant) {
      violations.push('Protocol compliance violations')
    }

    if (!apiContract.toolDefinitions.valid) {
      violations.push(...apiContract.toolDefinitions.issues)
    }

    if (!apiContract.responseFormats.valid) {
      violations.push(...apiContract.responseFormats.issues)
    }

    if (!apiContract.errorHandling.valid) {
      violations.push(...apiContract.errorHandling.issues)
    }

    return violations
  }

  private calculateOverallScores(results: Record<string, unknown>): { overall: number } {
    const scores: number[] = []

    if (results['compatibility']) {
      scores.push(this.calculateCompatibilityScore(results['compatibility']))
    }

    if (results['migration']) {
      const migration = results['migration'] as { allPathsValid?: boolean }
      scores.push(migration.allPathsValid ? 100 : 0)
    }

    if (results['apiContract']) {
      const apiContract = results['apiContract'] as { contractScore?: number }
      if (typeof apiContract.contractScore === 'number') {
        scores.push(apiContract.contractScore)
      }
    }

    if (results['systemIntegration']) {
      const systemIntegration = results['systemIntegration'] as { systemScore?: number }
      if (typeof systemIntegration.systemScore === 'number') {
        scores.push(systemIntegration.systemScore)
      }
    }

    return {
      overall: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    }
  }

  private generateRecommendations(summary: VerificationSummary): string[] {
    const recommendations: string[] = []

    if (summary.overall.score < 95) {
      recommendations.push('System requires additional optimization before production deployment')
    }

    if (summary.compatibility && !summary.compatibility.passed) {
      recommendations.push('Address backward compatibility issues before deployment')
    }

    if (summary.migration && !summary.migration.passed) {
      recommendations.push('Fix migration path validation issues')
    }

    if (summary.apiContract && !summary.apiContract.passed) {
      recommendations.push('Resolve API contract violations')
    }

    if (summary.systemIntegration && summary.systemIntegration.testResolution < 100) {
      recommendations.push('Resolve all remaining test cases before deployment')
    }

    if (summary.systemIntegration && summary.systemIntegration.performanceScore < 90) {
      recommendations.push('Optimize system performance to meet targets')
    }

    if (summary.systemIntegration && summary.systemIntegration.securityScore < 95) {
      recommendations.push('Address security vulnerabilities')
    }

    if (recommendations.length === 0) {
      recommendations.push('System is ready for production deployment')
    }

    return recommendations
  }

  private handleVerificationError(error: unknown, executionTime: number): VerificationSummary {
    return {
      overall: {
        passed: false,
        score: 0,
        executionTime,
        readyForProduction: false,
      },
      compatibility: null,
      migration: null,
      apiContract: null,
      systemIntegration: null,
      recommendations: ['Fix verification system errors before proceeding'],
      criticalIssues: [
        `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ],
    }
  }

  // Convenience methods for specific verification types
  async quickCompatibilityCheck(): Promise<boolean> {
    try {
      const result = await this.compatibilityVerifier.verifyCompleteCompatibility()
      return result.overallCompatible
    } catch {
      return false
    }
  }

  async quickMigrationCheck(): Promise<boolean> {
    try {
      const result = await this.migrationValidator.validateMigrationPaths()
      return result.allPathsValid
    } catch {
      return false
    }
  }

  async quickSystemCheck(): Promise<boolean> {
    try {
      const result = await this.systemTester.runCompleteSystemTest()
      return result.overallSuccess && result.testResolution.allResolved
    } catch {
      return false
    }
  }
}
