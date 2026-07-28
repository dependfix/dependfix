export interface PlanStep {
    id: string
    title: string
    owner: string
}

export function createExecutionPlan(steps: PlanStep[]): PlanStep[] {
    return steps
}
