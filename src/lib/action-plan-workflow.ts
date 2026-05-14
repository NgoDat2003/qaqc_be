export const ACTION_PLAN_STATUSES = ["draft", "submitted", "rejected", "closed"] as const;

export type ActionPlanStatus = (typeof ACTION_PLAN_STATUSES)[number];
export type ActionPlanReviewAction = "confirm" | "reject";

const EDITABLE_STATUSES: ActionPlanStatus[] = ["draft", "rejected"];

export function isActionPlanStatus(status: string): status is ActionPlanStatus {
  return ACTION_PLAN_STATUSES.includes(status as ActionPlanStatus);
}

export function canEditActionPlan(status: string): boolean {
  return isActionPlanStatus(status) && EDITABLE_STATUSES.includes(status);
}

export function canSubmitActionPlan(status: string): boolean {
  return canEditActionPlan(status);
}

export function canReviewActionPlan(status: string): boolean {
  return status === "submitted";
}

export function getReviewedActionPlanStatus(action: ActionPlanReviewAction): ActionPlanStatus {
  return action === "confirm" ? "closed" : "rejected";
}

export function isActionPlanClosedByReview(action: ActionPlanReviewAction): boolean {
  return getReviewedActionPlanStatus(action) === "closed";
}
