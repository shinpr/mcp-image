/**
 * Metadata management system for 2-stage processing
 * Handles session tracking, stage recording, and performance metrics
 */

import type { ProcessingMetadata, StageMetadata } from '../../types/twoStageTypes'

/**
 * Session data stored in memory
 */
interface SessionData extends ProcessingMetadata {
  active: boolean
}

/**
 * Metadata manager for generation sessions
 */
export class GenerationMetadataManager {
  private sessions: Map<string, SessionData> = new Map()
  private sessionCounter = 0

  /**
   * Create a new processing session
   */
  createSession(originalPrompt: string): string {
    const sessionId = this.generateSessionId()

    const session: SessionData = {
      sessionId,
      originalPrompt,
      stages: [],
      totalProcessingTime: 0,
      promptEnhancementTime: 0,
      imageGenerationTime: 0,
      appliedOptimizations: [],
      fallbackUsed: false,
      timestamp: new Date(),
      active: true,
    }

    this.sessions.set(sessionId, session)
    return sessionId
  }

  /**
   * Record a processing stage
   */
  recordStage(sessionId: string, stage: Omit<StageMetadata, 'startTime'>): void {
    const session = this.sessions.get(sessionId)
    if (!session || !session.active) {
      return
    }

    const stageWithTimestamp: StageMetadata = {
      ...stage,
      startTime: new Date(),
    }

    session.stages.push(stageWithTimestamp)
  }

  /**
   * Mark a stage as completed
   */
  completeStage(sessionId: string, stageName: string, outputData?: unknown): void {
    const session = this.sessions.get(sessionId)
    if (!session || !session.active) {
      return
    }

    const stage = session.stages.find((s) => s.stageName === stageName && s.status === 'processing')
    if (stage) {
      stage.status = 'completed'
      stage.endTime = new Date()
      stage.processingTime = stage.endTime.getTime() - stage.startTime.getTime()
      stage.outputData = outputData

      // Update session timing based on stage
      if (stage.processingTime) {
        switch (stageName) {
          case 'Structured Prompt Generation':
          case 'POML Template Structuring':
          case 'Best Practices Enhancement':
            session.promptEnhancementTime += stage.processingTime
            break
          case 'Image Generation':
          case 'Fallback Image Generation':
            session.imageGenerationTime += stage.processingTime
            break
        }
      }
    }
  }

  /**
   * Mark a stage as failed
   */
  failStage(sessionId: string, stageName: string, error: Error): void {
    const session = this.sessions.get(sessionId)
    if (!session || !session.active) {
      return
    }

    const stage = session.stages.find((s) => s.stageName === stageName && s.status === 'processing')
    if (stage) {
      stage.status = 'failed'
      stage.endTime = new Date()
      stage.processingTime = stage.endTime.getTime() - stage.startTime.getTime()
      stage.error = error
    }
  }

  /**
   * Record applied optimizations
   */
  recordOptimization(sessionId: string, optimization: string): void {
    const session = this.sessions.get(sessionId)
    if (session?.active) {
      session.appliedOptimizations.push(optimization)
    }
  }

  /**
   * Mark fallback as used
   */
  recordFallback(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session?.active) {
      session.fallbackUsed = true
    }
  }

  /**
   * Complete a session and calculate final metrics
   */
  completeSession(sessionId: string): ProcessingMetadata | undefined {
    const session = this.sessions.get(sessionId)
    if (!session || !session.active) {
      return undefined
    }

    // Calculate total processing time
    session.totalProcessingTime = session.promptEnhancementTime + session.imageGenerationTime

    // Mark session as inactive
    session.active = false

    // Return immutable copy
    const metadata: ProcessingMetadata = {
      sessionId: session.sessionId,
      originalPrompt: session.originalPrompt,
      stages: [...session.stages],
      totalProcessingTime: session.totalProcessingTime,
      promptEnhancementTime: session.promptEnhancementTime,
      imageGenerationTime: session.imageGenerationTime,
      appliedOptimizations: [...session.appliedOptimizations],
      fallbackUsed: session.fallbackUsed,
      timestamp: session.timestamp,
    }

    return metadata
  }

  /**
   * Get current session metadata
   */
  getSession(sessionId: string): ProcessingMetadata | undefined {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return undefined
    }

    return {
      sessionId: session.sessionId,
      originalPrompt: session.originalPrompt,
      stages: [...session.stages],
      totalProcessingTime: session.totalProcessingTime,
      promptEnhancementTime: session.promptEnhancementTime,
      imageGenerationTime: session.imageGenerationTime,
      appliedOptimizations: [...session.appliedOptimizations],
      fallbackUsed: session.fallbackUsed,
      timestamp: session.timestamp,
    }
  }

  /**
   * Clean up old inactive sessions (memory management)
   */
  cleanup(maxAge = 3600000): number {
    // Default 1 hour
    const now = Date.now()
    let cleaned = 0

    for (const [sessionId, session] of this.sessions.entries()) {
      if (!session.active && now - session.timestamp.getTime() > maxAge) {
        this.sessions.delete(sessionId)
        cleaned++
      }
    }

    return cleaned
  }

  /**
   * Get statistics for monitoring and observability
   */
  getStatistics(): {
    activeSessions: number
    totalSessions: number
    averageProcessingTime: number
    successRate: number
    fallbackRate: number
    performanceMetrics: {
      averagePromptTime: number
      averageImageTime: number
      timeoutCount: number
    }
  } {
    const sessions = Array.from(this.sessions.values())
    const activeSessions = sessions.filter((s) => s.active).length
    const completedSessions = sessions.filter((s) => !s.active)

    const averageProcessingTime =
      completedSessions.length > 0
        ? completedSessions.reduce((sum, s) => sum + s.totalProcessingTime, 0) /
          completedSessions.length
        : 0

    const successfulSessions = completedSessions.filter((s) =>
      s.stages.some(
        (stage) => stage.status === 'completed' && stage.stageName === 'Image Generation'
      )
    ).length

    const successRate =
      completedSessions.length > 0 ? successfulSessions / completedSessions.length : 0

    const fallbackSessions = completedSessions.filter((s) => s.fallbackUsed).length
    const fallbackRate =
      completedSessions.length > 0 ? fallbackSessions / completedSessions.length : 0

    const averagePromptTime =
      completedSessions.length > 0
        ? completedSessions.reduce((sum, s) => sum + s.promptEnhancementTime, 0) /
          completedSessions.length
        : 0

    const averageImageTime =
      completedSessions.length > 0
        ? completedSessions.reduce((sum, s) => sum + s.imageGenerationTime, 0) /
          completedSessions.length
        : 0

    const timeoutSessions = completedSessions.filter((s) =>
      s.appliedOptimizations.some((opt) => opt.includes('performance target exceeded'))
    ).length

    return {
      activeSessions,
      totalSessions: sessions.length,
      averageProcessingTime,
      successRate,
      fallbackRate,
      performanceMetrics: {
        averagePromptTime,
        averageImageTime,
        timeoutCount: timeoutSessions,
      },
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    this.sessionCounter++
    const timestamp = Date.now().toString(36)
    const counter = this.sessionCounter.toString(36)
    const random = Math.random().toString(36).substring(2, 8)
    return `2stage-${timestamp}-${counter}-${random}`
  }
}

/**
 * Global metadata manager instance
 */
export const globalMetadataManager = new GenerationMetadataManager()
