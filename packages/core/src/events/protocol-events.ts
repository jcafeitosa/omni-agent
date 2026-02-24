import { z } from "zod";
import type { PlanUpdatePayload, RequestUserInputEventPayload } from "../types/messages.js";

export const requestUserInputOptionSchema = z.object({
    label: z.string().min(1),
    description: z.string().min(1)
});

export const requestUserInputQuestionSchema = z.object({
    id: z.string().min(1),
    header: z.string().min(1),
    question: z.string().min(1),
    isOther: z.boolean().optional(),
    isSecret: z.boolean().optional(),
    options: z.array(requestUserInputOptionSchema).optional()
});

export const requestUserInputPayloadSchema = z.object({
    call_id: z.string().min(1),
    turn_id: z.string().min(1).optional(),
    questions: z.array(requestUserInputQuestionSchema).min(1)
});

export const planUpdateStepSchema = z.object({
    step: z.string().min(1),
    status: z.enum(["pending", "in_progress", "completed"])
});

export const planUpdatePayloadSchema = z.object({
    explanation: z.string().min(1).optional(),
    plan: z.array(planUpdateStepSchema).min(1)
});

export function parseRequestUserInputPayload(input: unknown): RequestUserInputEventPayload | null {
    const parsed = requestUserInputPayloadSchema.safeParse(input);
    if (!parsed.success) return null;
    return parsed.data;
}

export function parsePlanUpdatePayload(input: unknown): PlanUpdatePayload | null {
    const parsed = planUpdatePayloadSchema.safeParse(input);
    if (!parsed.success) return null;
    return parsed.data;
}
