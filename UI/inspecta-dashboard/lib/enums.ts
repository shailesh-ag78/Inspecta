/**
 * Enums matching those defined in DataStore/postgresdb.py
 * These must stay in sync with the Python enums
 */

export enum Industry {
  SOLAR = 1,
  OIL_GAS = 2,
  TELECOM = 3,
}

export enum TaskStatus {
  PENDING = 1,
  IN_PROGRESS = 2,
  EXPERT_REVIEW = 3,
  COMPLETED = 4,
  FAILED = 5,
}

export enum TaskSeverity {
  SEVERE = 1,
  REGULAR = 2,
  LOW = 3,
}

export enum TaskType {
  INSTALL = 1,
  REPAIR = 2,
  VERIFY = 3,
  CLEAR = 4,
}

// Helper function to get label for task status
export function getTaskStatusLabel(statusId: number): string {
  const labels: Record<number, string> = {
    [TaskStatus.PENDING]: 'pending',
    [TaskStatus.IN_PROGRESS]: 'in_progress',
    [TaskStatus.EXPERT_REVIEW]: 'review',
    [TaskStatus.COMPLETED]: 'completed',
    [TaskStatus.FAILED]: 'failed',
  };
  return labels[statusId] || 'unknown';
}

// Helper function to get label for task type
export function getTaskTypeLabel(typeId: number): string {
  const labels: Record<number, string> = {
    [TaskType.INSTALL]: 'install',
    [TaskType.REPAIR]: 'repair',
    [TaskType.VERIFY]: 'verify',
    [TaskType.CLEAR]: 'clear',
  };
  return labels[typeId] || 'verify';
}

// Helper function to get label for severity
export function getSeverityLabel(severityId: number): string {
  const labels: Record<number, string> = {
    [TaskSeverity.SEVERE]: 'Severe',
    [TaskSeverity.REGULAR]: 'Regular',
    [TaskSeverity.LOW]: 'Low',
  };
  return labels[severityId] || 'Regular';
}
