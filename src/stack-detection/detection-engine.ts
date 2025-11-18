/**
 * Main stack detection engine.
 */

import type {
  StackRegistry,
  StackDefinition,
  DetectionOptions,
  WorkspaceStackDetectionResult,
  DetectedStack,
  ConsideredStack,
  IndicatorEvidence,
  Indicator,
  StackCategory,
} from '../types/index.js';
import { IndicatorEvaluator } from './indicator-evaluator.js';

interface StackEvaluation {
  stack: StackDefinition;
  score: number;
  evidence: IndicatorEvidence[];
  requiredSatisfied: boolean;
}

export class StackDetectionEngine {
  constructor(private registry: StackRegistry) {}

  async detectStacks(
    workspaceId: string,
    workspaceRoot: string,
    options?: DetectionOptions
  ): Promise<WorkspaceStackDetectionResult> {
    const startTime = Date.now();
    const timeoutMs = options?.limits?.timeoutMs ?? 30000; // 30s default
    const maxBytesPerFile = options?.limits?.maxBytesPerFile ?? 1024 * 1024;

    const evaluator = new IndicatorEvaluator(workspaceRoot, maxBytesPerFile);

    // Determine which stacks to evaluate
    const stacksToEvaluate = this.getStacksToEvaluate(options);

    // Evaluate each stack
    const evaluations: StackEvaluation[] = [];

    for (const stack of stacksToEvaluate) {
      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        break;
      }

      const evaluation = await this.evaluateStack(stack, evaluator);
      evaluations.push(evaluation);
    }

    // Separate detected from considered
    const detectedStacks: DetectedStack[] = [];
    const consideredStacks: ConsideredStack[] = [];

    for (const evaluation of evaluations) {
      const { stack, score, evidence, requiredSatisfied } = evaluation;

      // Must satisfy required indicators and meet min score
      if (!requiredSatisfied || score < stack.detection.minScore) {
        // Considered but not detected
        const confidence = this.calculateConfidence(stack, score);
        consideredStacks.push({
          id: stack.id,
          displayName: stack.displayName,
          category: stack.category,
          score,
          confidence,
          evidence,
        });
        continue;
      }

      // Stack is detected
      const confidence = this.calculateConfidence(stack, score);
      detectedStacks.push({
        id: stack.id,
        displayName: stack.displayName,
        category: stack.category,
        score,
        confidence,
        evidence,
      });
    }

    // Resolve dependencies
    const detectedIds = new Set(detectedStacks.map((s) => s.id));
    for (const stack of detectedStacks) {
      const def = this.registry.stacks[stack.id];
      if (def?.dependsOn) {
        stack.resolvedDependencies = def.dependsOn.filter((depId) =>
          detectedIds.has(depId)
        );
      }
    }

    // Generate summary
    const summary = this.generateSummary(detectedStacks);

    return {
      workspaceId,
      rootPath: workspaceRoot,
      detectedStacks,
      consideredStacks,
      summary,
    };
  }

  private getStacksToEvaluate(options?: DetectionOptions): StackDefinition[] {
    const allStacks = Object.values(this.registry.stacks);

    let stacks = allStacks;

    // Apply include filter
    if (options?.includeStacks && options.includeStacks.length > 0) {
      stacks = stacks.filter((s) => options.includeStacks?.includes(s.id));
    }

    // Apply exclude filter
    if (options?.excludeStacks && options.excludeStacks.length > 0) {
      stacks = stacks.filter((s) => !options.excludeStacks?.includes(s.id));
    }

    return stacks;
  }

  private async evaluateStack(
    stack: StackDefinition,
    evaluator: IndicatorEvaluator
  ): Promise<StackEvaluation> {
    let score = 0;
    const evidence: IndicatorEvidence[] = [];
    let requiredSatisfied = true;

    // Evaluate requiredAny indicators
    if (stack.indicators.requiredAny && stack.indicators.requiredAny.length > 0) {
      let anyMatched = false;
      for (const indicator of stack.indicators.requiredAny) {
        const results = await evaluator.evaluate(indicator);
        if (results.length > 0) {
          anyMatched = true;
          score += indicator.weight;
          evidence.push(...results);
        }
      }
      if (!anyMatched) {
        requiredSatisfied = false;
      }
    }

    // Evaluate requiredAll indicators
    if (stack.indicators.requiredAll && stack.indicators.requiredAll.length > 0) {
      for (const indicator of stack.indicators.requiredAll) {
        const results = await evaluator.evaluate(indicator);
        if (results.length > 0) {
          score += indicator.weight;
          evidence.push(...results);
        } else {
          requiredSatisfied = false;
        }
      }
    }

    // Evaluate optional indicators
    if (stack.indicators.optional && stack.indicators.optional.length > 0) {
      for (const indicator of stack.indicators.optional) {
        const results = await evaluator.evaluate(indicator);
        if (results.length > 0) {
          score += indicator.weight;
          evidence.push(...results);
        }
      }
    }

    return {
      stack,
      score,
      evidence,
      requiredSatisfied,
    };
  }

  private calculateConfidence(stack: StackDefinition, score: number): number {
    const maxScore =
      stack.detection.maxScore ?? this.calculateMaxScore(stack.indicators);
    if (maxScore === 0) {
      return 0;
    }
    return Math.min(1, score / maxScore);
  }

  private calculateMaxScore(indicators: {
    requiredAny?: Indicator[];
    requiredAll?: Indicator[];
    optional?: Indicator[];
  }): number {
    let max = 0;

    // For requiredAny, we take the max weight (only one can match)
    if (indicators.requiredAny) {
      const maxRequired = Math.max(
        ...indicators.requiredAny.map((i) => i.weight),
        0
      );
      max += maxRequired;
    }

    // For requiredAll, we sum all weights
    if (indicators.requiredAll) {
      max += indicators.requiredAll.reduce((sum, i) => sum + i.weight, 0);
    }

    // For optional, we sum all weights
    if (indicators.optional) {
      max += indicators.optional.reduce((sum, i) => sum + i.weight, 0);
    }

    return max;
  }

  private generateSummary(detectedStacks: DetectedStack[]): {
    dominantLanguages?: string[];
    primaryByCategory?: Record<StackCategory, string[]>;
  } {
    const byCategory: Partial<Record<StackCategory, DetectedStack[]>> = {};

    // Group by category
    for (const stack of detectedStacks) {
      if (!byCategory[stack.category]) {
        byCategory[stack.category] = [];
      }
      byCategory[stack.category]?.push(stack);
    }

    // Sort each category by priority (from definition) and confidence
    const primaryByCategory: Record<StackCategory, string[]> = {
      language: [],
      framework: [],
      runtime: [],
      tooling: [],
    };

    for (const [category, stacks] of Object.entries(byCategory) as [
      StackCategory,
      DetectedStack[]
    ][]) {
      const sorted = stacks.sort((a, b) => {
        const aDef = this.registry.stacks[a.id];
        const bDef = this.registry.stacks[b.id];
        const aPriority = aDef?.detection.priority ?? 0;
        const bPriority = bDef?.detection.priority ?? 0;

        // Higher priority first
        if (aPriority !== bPriority) {
          return bPriority - aPriority;
        }

        // Higher confidence first
        return b.confidence - a.confidence;
      });

      primaryByCategory[category] = sorted.map((s) => s.id);
    }

    // Dominant languages are the top language stacks
    const dominantLanguages = primaryByCategory.language.slice(0, 3);

    return {
      dominantLanguages,
      primaryByCategory,
    };
  }
}
