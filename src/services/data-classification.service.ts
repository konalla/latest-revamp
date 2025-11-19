/**
 * Data Classification Service
 * 
 * Classifies data types as PERSONAL, SENSITIVE, or NON_PERSONAL
 * Used to determine access control and data sharing rules.
 */

export enum DataType {
  PERSONAL = "PERSONAL",      // Can be aggregated for team views, but not shown individually to others
  SENSITIVE = "SENSITIVE",    // Never shared, never aggregated with individual attribution, own-only
  NON_PERSONAL = "NON_PERSONAL" // Can be freely shared and aggregated
}

/**
 * Data classification map
 * Maps data types to their classification
 */
const DATA_CLASSIFICATION: Record<string, DataType> = {
  // Analytics Data
  "analytics.productivity": DataType.PERSONAL,
  "analytics.focus": DataType.PERSONAL,
  "analytics.okr": DataType.PERSONAL,
  "analytics.trends": DataType.PERSONAL,
  
  // Cognitive Load Data (SENSITIVE)
  "cognitive_load.meter": DataType.SENSITIVE,
  "cognitive_load.workload_score": DataType.SENSITIVE,
  "cognitive_load.burnout_risk": DataType.SENSITIVE,
  "cognitive_load.workload_history": DataType.SENSITIVE,
  "cognitive_load.capacity_utilization": DataType.SENSITIVE,
  "cognitive_load.recovery_rate": DataType.SENSITIVE,
  
  // Focus Session Data
  "focus_session.basic": DataType.PERSONAL,  // duration, completed tasks
  "focus_session.mood": DataType.SENSITIVE,
  "focus_session.energy_level": DataType.SENSITIVE,
  "focus_session.cognitive_flow_score": DataType.SENSITIVE,
  "focus_session.flow_state": DataType.SENSITIVE,
  "focus_session.distractions": DataType.PERSONAL,
  "focus_session.ai_score": DataType.SENSITIVE,
  
  // User Profile Data
  "user.name": DataType.PERSONAL,
  "user.email": DataType.PERSONAL,
  "user.phone": DataType.PERSONAL,  // Respects visibility setting
  "user.profile_photo": DataType.PERSONAL,
  "user.job_title": DataType.PERSONAL,
  "user.bio": DataType.PERSONAL,
  
  // Project/OKR Data
  "project.progress": DataType.NON_PERSONAL,  // Aggregated project data
  "okr.completion": DataType.PERSONAL,        // Individual OKR
  "okr.team_progress": DataType.NON_PERSONAL  // Aggregated OKR
};

/**
 * Sensitive field names that should be filtered out
 */
const SENSITIVE_FIELDS = [
  "mood",
  "energyLevel",
  "energy_level",
  "cognitiveFlowScore",
  "cognitive_flow_score",
  "flowState",
  "flow_state",
  "aiScore",
  "ai_score",
  "currentWorkloadScore",
  "current_workload_score",
  "burnoutRiskScore",
  "burnout_risk_score",
  "burnoutRiskLevel",
  "burnout_risk_level",
  "workloadHistory",
  "workload_history",
  "capacityUtilization",
  "capacity_utilization",
  "recoveryRate",
  "recovery_rate"
];

export class DataClassificationService {
  /**
   * Classify a data type
   */
  classifyDataType(dataType: string): DataType {
    return DATA_CLASSIFICATION[dataType] || DataType.PERSONAL; // Default to PERSONAL for safety
  }

  /**
   * Check if a data type can be shared based on user role
   * Note: SENSITIVE data can be aggregated (anonymized) for TEAM_MANAGER and ADMIN
   */
  canShareDataType(dataType: string, userRole: "MEMBER" | "TEAM_MANAGER" | "ADMIN"): boolean {
    const type = this.classifyDataType(dataType);
    
    // MEMBER cannot share any data
    if (userRole === "MEMBER") {
      return false;
    }
    
    // SENSITIVE data can be aggregated (anonymized) for TEAM_MANAGER and ADMIN
    // Individual SENSITIVE data is never shared, but aggregated/anonymized versions are allowed
    if (type === DataType.SENSITIVE) {
      return userRole === "TEAM_MANAGER" || userRole === "ADMIN";
    }
    
    // NON_PERSONAL data can always be shared
    if (type === DataType.NON_PERSONAL) {
      return true;
    }
    
    // PERSONAL data can be aggregated for TEAM_MANAGER and ADMIN
    if (type === DataType.PERSONAL) {
      return userRole === "TEAM_MANAGER" || userRole === "ADMIN";
    }
    
    return false;
  }

  /**
   * Check if a data type can be aggregated
   */
  canAggregateDataType(dataType: string): boolean {
    const type = this.classifyDataType(dataType);
    // All types can be aggregated, but SENSITIVE must be fully anonymized
    return true;
  }

  /**
   * Filter sensitive fields from a data object
   */
  filterSensitiveFields(data: any, dataType?: string): any {
    if (!data || typeof data !== "object") {
      return data;
    }

    // If data type is SENSITIVE, filter all sensitive fields
    if (dataType && this.classifyDataType(dataType) === DataType.SENSITIVE) {
      // For sensitive data, we might want to return empty or minimal data
      // But for aggregation, we might return counts only
      return {};
    }

    // Filter out sensitive fields from the data
    const filtered: any = Array.isArray(data) ? [] : {};
    
    for (const key in data) {
      if (SENSITIVE_FIELDS.includes(key)) {
        continue; // Skip sensitive fields
      }
      
      const value = data[key];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        // Recursively filter nested objects
        filtered[key] = this.filterSensitiveFields(value);
      } else if (Array.isArray(value)) {
        // Filter array items
        filtered[key] = value.map(item => 
          typeof item === "object" ? this.filterSensitiveFields(item) : item
        );
      } else {
        filtered[key] = value;
      }
    }
    
    return filtered;
  }

  /**
   * Get fields that can be aggregated for a data type
   */
  getAggregatableFields(dataType: string): string[] {
    const type = this.classifyDataType(dataType);
    
    if (type === DataType.SENSITIVE) {
      // For sensitive data, only allow counts and averages, no individual attribution
      return ["count", "average", "sum", "min", "max"];
    }
    
    // For PERSONAL and NON_PERSONAL, allow more aggregation
    return ["count", "average", "sum", "min", "max", "distribution"];
  }

  /**
   * Check if a field is sensitive
   */
  isSensitiveField(fieldName: string): boolean {
    return SENSITIVE_FIELDS.includes(fieldName);
  }
}

export default new DataClassificationService();

