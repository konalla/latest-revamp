import "reflect-metadata";
import { WorkCategory } from "../services/ai-recommendation.service.js";
import type { TaskRecommendation, TaskAnalysis, UserWorkPreferences } from "../services/ai-recommendation.service.js";

// Metadata keys
const AI_RECOMMENDATION_METADATA = Symbol("ai-recommendation");
const PROMPT_TEMPLATE_METADATA = Symbol("prompt-template");
const CATEGORY_RULES_METADATA = Symbol("category-rules");

// Define interfaces for decorator metadata
interface AIRecommendationMetadata {
  enabled: boolean;
  priority: number;
  customPrompt?: string;
  categoryRules?: CategoryRule[];
}

interface CategoryRule {
  category: WorkCategory;
  conditions: Condition[];
  weight: number;
}

interface Condition {
  field: keyof TaskAnalysis;
  operator: "equals" | "contains" | "greaterThan" | "lessThan" | "includes";
  value: any;
}

interface PromptTemplateMetadata {
  template: string;
  variables: string[];
  dynamicRules: boolean;
}

/**
 * Decorator to mark a method as AI recommendation enabled
 */
export function AIRecommendation(config: Partial<AIRecommendationMetadata> = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const metadata: AIRecommendationMetadata = {
      enabled: true,
      priority: 1,
      ...config
    };

    Reflect.defineMetadata(AI_RECOMMENDATION_METADATA, metadata, target, propertyKey);
    
    // Store original method
    const originalMethod = descriptor.value;
    
    // Wrap method with AI recommendation logic
    descriptor.value = async function (...args: any[]) {
      const metadata = Reflect.getMetadata(AI_RECOMMENDATION_METADATA, target, propertyKey);
      
      if (metadata?.enabled) {
        // Add AI recommendation logic here
        console.log(`AI Recommendation enabled for ${propertyKey}`);
      }
      
      return originalMethod.apply(this, args);
    };
    
    return descriptor;
  };
}

/**
 * Decorator to define custom prompt template for AI recommendations
 */
export function PromptTemplate(template: string, variables: string[] = [], dynamicRules: boolean = true) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const metadata: PromptTemplateMetadata = {
      template,
      variables,
      dynamicRules
    };

    Reflect.defineMetadata(PROMPT_TEMPLATE_METADATA, metadata, target, propertyKey);
    
    return descriptor;
  };
}

/**
 * Decorator to define category-specific rules for task classification
 */
export function CategoryRules(rules: CategoryRule[]) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    Reflect.defineMetadata(CATEGORY_RULES_METADATA, rules, target, propertyKey);
    
    return descriptor;
  };
}

/**
 * Decorator to automatically categorize tasks based on predefined rules
 */
export function AutoCategorize() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args);
      
      // Get category rules from metadata
      const rules = Reflect.getMetadata(CATEGORY_RULES_METADATA, target, propertyKey);
      
      if (rules && Array.isArray(result)) {
        // Apply auto-categorization to each task
        for (const task of result) {
          if (task && typeof task === 'object') {
            task.aiCategory = categorizeTask(task, rules);
          }
        }
      }
      
      return result;
    };
    
    return descriptor;
  };
}

/**
 * Decorator to enhance task data with AI recommendations
 */
export function WithAIRecommendation() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args);
      
      // Check if AI recommendation is enabled
      const metadata = Reflect.getMetadata(AI_RECOMMENDATION_METADATA, target, propertyKey);
      
      if (metadata?.enabled && result) {
        // Enhance result with AI recommendations
        if (Array.isArray(result)) {
          for (const item of result) {
            if (item && typeof item === 'object' && item.id) {
              item.aiRecommendation = await generateAIRecommendation(item);
            }
          }
        } else if (result && typeof result === 'object' && result.id) {
          result.aiRecommendation = await generateAIRecommendation(result);
        }
      }
      
      return result;
    };
    
    return descriptor;
  };
}

/**
 * Decorator to validate AI recommendations
 */
export function ValidateRecommendation() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args);
      
      if (result && result.aiRecommendation) {
        // Validate the AI recommendation
        const isValid = validateRecommendation(result.aiRecommendation);
        
        if (!isValid) {
          console.warn(`Invalid AI recommendation for task ${result.id}`);
          // Apply fallback logic
          result.aiRecommendation = getFallbackRecommendation(result);
        }
      }
      
      return result;
    };
    
    return descriptor;
  };
}

/**
 * Helper function to categorize a task based on rules
 * Enhanced with rulebook-based logic
 */
function categorizeTask(task: any, rules: CategoryRule[]): WorkCategory {
  let bestCategory = WorkCategory.EXECUTIVE_WORK; // Default fallback
  let highestScore = 0;
  
  // First, try rule-based classification
  for (const rule of rules) {
    let score = 0;
    let matches = 0;
    
    for (const condition of rule.conditions) {
      if (evaluateCondition(task, condition)) {
        matches++;
        score += rule.weight;
      }
    }
    
    // If all conditions match, this is a strong candidate
    if (matches === rule.conditions.length && score > highestScore) {
      highestScore = score;
      bestCategory = rule.category;
    }
  }
  
  // If no rules matched, use rulebook-based fallback logic
  if (highestScore === 0) {
    return getRulebookBasedCategory(task);
  }
  
  return bestCategory;
}

/**
 * Rulebook-based categorization when decorator rules don't match
 */
function getRulebookBasedCategory(task: any): WorkCategory {
  const title = (task.title || "").toLowerCase();
  const description = (task.description || "").toLowerCase();
  const projectName = (task.projectName || "").toLowerCase();
  const combinedText = `${title} ${description} ${projectName}`;

  // Deep Work indicators
  const deepWorkKeywords = ["design", "develop", "analyze", "strategy", "focus", "implement", "debug", "research", "code", "algorithm", "complex", "technical"];
  const deepWorkProjects = ["software development", "thesis research", "strategic planning", "development", "engineering"];
  
  // Creative Work indicators
  const creativeKeywords = ["brainstorm", "invent", "imagine", "conceptualize", "create", "write", "compose", "design", "art", "creative", "draft", "prototype"];
  const creativeProjects = ["brand design", "content creation", "marketing campaign", "creative", "design"];
  
  // Reflective Work indicators
  const reflectiveKeywords = ["plan", "review", "learn", "research", "consider", "strategize", "reflect", "study", "analyze options", "post-mortem"];
  const reflectiveProjects = ["professional development", "strategic planning", "learning", "training"];
  
  // Executive Work indicators
  const executiveKeywords = ["reply", "call", "meeting", "update", "schedule", "approve", "coordinate", "manage", "email", "admin"];
  const executiveProjects = ["operations", "team management", "administration", "admin"];

  // Classification logic based on rulebook
  if (task.duration >= 60 && task.importance && 
      (deepWorkKeywords.some(kw => combinedText.includes(kw)) || 
       deepWorkProjects.some(proj => combinedText.includes(proj)))) {
    return WorkCategory.DEEP_WORK;
  } else if (creativeKeywords.some(kw => combinedText.includes(kw)) || 
             creativeProjects.some(proj => combinedText.includes(proj))) {
    return WorkCategory.CREATIVE_WORK;
  } else if (reflectiveKeywords.some(kw => combinedText.includes(kw)) || 
             reflectiveProjects.some(proj => combinedText.includes(proj)) ||
             (task.importance && !task.urgency)) {
    return WorkCategory.REFLECTIVE_WORK;
  } else if (task.urgency || 
             task.duration <= 30 || 
             executiveKeywords.some(kw => combinedText.includes(kw)) || 
             executiveProjects.some(proj => combinedText.includes(proj))) {
    return WorkCategory.EXECUTIVE_WORK;
  } else {
    // Default fallback based on Eisenhower Matrix
    if (task.urgency && !task.importance) {
      return WorkCategory.EXECUTIVE_WORK;
    } else if (task.importance && !task.urgency) {
      return WorkCategory.DEEP_WORK;
    } else if (task.importance && task.urgency) {
      return WorkCategory.EXECUTIVE_WORK;
    } else {
      return WorkCategory.EXECUTIVE_WORK;
    }
  }
}

/**
 * Helper function to evaluate a condition
 */
function evaluateCondition(task: any, condition: Condition): boolean {
  const value = task[condition.field];
  
  switch (condition.operator) {
    case "equals":
      return value === condition.value;
    case "contains":
      return typeof value === 'string' && value.includes(condition.value);
    case "greaterThan":
      return typeof value === 'number' && value > condition.value;
    case "lessThan":
      return typeof value === 'number' && value < condition.value;
    case "includes":
      return Array.isArray(value) && value.includes(condition.value);
    default:
      return false;
  }
}

/**
 * Helper function to generate AI recommendation (placeholder)
 */
async function generateAIRecommendation(task: any): Promise<TaskRecommendation> {
  // This would integrate with the AI service
  // For now, return a mock recommendation
  return {
    category: WorkCategory.DEEP_WORK,
    recommendedTime: "09:00",
    confidence: 0.8,
    reasoning: "Generated by AI recommendation decorator"
  };
}

/**
 * Helper function to validate AI recommendation
 */
function validateRecommendation(recommendation: TaskRecommendation): boolean {
  return (
    recommendation &&
    Object.values(WorkCategory).includes(recommendation.category) &&
    typeof recommendation.recommendedTime === 'string' &&
    typeof recommendation.confidence === 'number' &&
    recommendation.confidence >= 0 &&
    recommendation.confidence <= 1 &&
    typeof recommendation.reasoning === 'string'
  );
}

/**
 * Helper function to get fallback recommendation
 */
function getFallbackRecommendation(task: any): TaskRecommendation {
  // Simple fallback based on task attributes
  let category = WorkCategory.EXECUTIVE_WORK;
  
  if (task.importance && !task.urgency) {
    category = WorkCategory.DEEP_WORK;
  } else if (task.importance && task.urgency) {
    category = WorkCategory.CREATIVE_WORK;
  } else if (!task.importance && !task.urgency) {
    category = WorkCategory.REFLECTIVE_WORK;
  }
  
  return {
    category,
    recommendedTime: "09:00",
    confidence: 0.5,
    reasoning: "Fallback recommendation"
  };
}

/**
 * Utility function to get metadata from a method
 */
export function getAIMetadata(target: any, propertyKey: string): AIRecommendationMetadata | undefined {
  return Reflect.getMetadata(AI_RECOMMENDATION_METADATA, target, propertyKey);
}

/**
 * Utility function to get prompt template metadata from a method
 */
export function getPromptTemplateMetadata(target: any, propertyKey: string): PromptTemplateMetadata | undefined {
  return Reflect.getMetadata(PROMPT_TEMPLATE_METADATA, target, propertyKey);
}

/**
 * Utility function to get category rules metadata from a method
 */
export function getCategoryRulesMetadata(target: any, propertyKey: string): CategoryRule[] | undefined {
  return Reflect.getMetadata(CATEGORY_RULES_METADATA, target, propertyKey);
}

/**
 * Utility function to check if a method has AI recommendation enabled
 */
export function hasAIRecommendation(target: any, propertyKey: string): boolean {
  const metadata = getAIMetadata(target, propertyKey);
  return metadata?.enabled === true;
}

/**
 * Utility function to get all methods with AI recommendation enabled
 */
export function getMethodsWithAIRecommendation(target: any): string[] {
  const methods: string[] = [];
  const prototype = Object.getPrototypeOf(target);
  
  for (const propertyName of Object.getOwnPropertyNames(prototype)) {
    if (typeof prototype[propertyName] === 'function' && hasAIRecommendation(prototype, propertyName)) {
      methods.push(propertyName);
    }
  }
  
  return methods;
}
