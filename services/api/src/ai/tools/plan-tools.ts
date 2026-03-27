import { randomUUID } from "node:crypto";
import type {
  ClarificationQuestion,
  ClarificationQuestionType,
  Plan,
  PlanComplexity,
  PlanStep,
  ToolResult,
} from "@doable/shared/types/ai.js";
import type { Tool, ToolContext } from "./index.js";

// ─── ask_clarification ───────────────────────────────────

export const askClarificationTool: Tool = {
  name: "ask_clarification",
  description:
    "Ask the user clarifying questions before generating a plan. Use this when the request is ambiguous or underspecified. Maximum 4 questions per call.",
  parameters: {
    type: "object",
    required: ["questions"],
    properties: {
      questions: {
        type: "array",
        maxItems: 4,
        items: {
          type: "object",
          required: ["id", "question", "type"],
          properties: {
            id: { type: "string" },
            question: { type: "string" },
            type: {
              type: "string",
              enum: ["multi_choice", "yes_no", "free_text"],
            },
            options: {
              type: "array",
              items: { type: "string" },
              description: "Required for multi_choice type",
            },
            default: {
              type: "string",
              description: "AI's best guess for the answer",
            },
            context: {
              type: "string",
              description: "Why this question is being asked",
            },
          },
        },
      },
    },
  },

  async execute(
    params: Record<string, unknown>,
    _ctx: ToolContext,
  ): Promise<ToolResult> {
    const questions = params.questions as Array<Record<string, unknown>>;

    if (!Array.isArray(questions) || questions.length === 0) {
      return {
        success: false,
        output: "",
        error: "questions must be a non-empty array",
      };
    }

    if (questions.length > 4) {
      return {
        success: false,
        output: "",
        error: "Maximum 4 questions per call",
      };
    }

    const validatedQuestions: ClarificationQuestion[] = questions.map((q) => {
      const type = q.type as ClarificationQuestionType;
      const result: ClarificationQuestion = {
        id: (q.id as string) || randomUUID(),
        question: q.question as string,
        type,
      };
      if (type === "multi_choice" && Array.isArray(q.options)) {
        result.options = q.options as string[];
      }
      if (q.default != null) {
        result.default = q.default as string;
      }
      if (q.context != null) {
        result.context = q.context as string;
      }
      return result;
    });

    return {
      success: true,
      output: JSON.stringify(validatedQuestions),
      metadata: {
        type: "clarification",
        questions: validatedQuestions,
      },
    };
  },
};

// ─── create_plan ─────────────────────────────────────────

export const createPlanTool: Tool = {
  name: "create_plan",
  description:
    "Create a structured development plan for user approval. Call this after you have enough context (either from clarification answers or because the request was clear enough).",
  parameters: {
    type: "object",
    required: ["summary", "complexity", "steps"],
    properties: {
      summary: { type: "string" },
      complexity: {
        type: "string",
        enum: ["simple", "moderate", "complex"],
      },
      steps: {
        type: "array",
        items: {
          type: "object",
          required: ["title", "description"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            details: { type: "string" },
            filePaths: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
      },
    },
  },

  async execute(
    params: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const summary = params.summary as string;
    const complexity = params.complexity as PlanComplexity;
    const rawSteps = params.steps as Array<Record<string, unknown>>;

    if (!summary || typeof summary !== "string") {
      return {
        success: false,
        output: "",
        error: "summary is required and must be a string",
      };
    }

    if (!["simple", "moderate", "complex"].includes(complexity)) {
      return {
        success: false,
        output: "",
        error: "complexity must be one of: simple, moderate, complex",
      };
    }

    if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
      return {
        success: false,
        output: "",
        error: "steps must be a non-empty array",
      };
    }

    const steps: PlanStep[] = rawSteps.map((s, index) => ({
      id: randomUUID(),
      order: index + 1,
      title: s.title as string,
      description: s.description as string,
      details: (s.details as string) || undefined,
      filePaths: Array.isArray(s.filePaths)
        ? (s.filePaths as string[])
        : undefined,
      status: "pending" as const,
    }));

    const now = new Date().toISOString();

    const plan: Plan = {
      id: randomUUID(),
      projectId: ctx.projectId,
      summary,
      complexity,
      steps,
      status: "draft",
      createdAt: now,
    };

    return {
      success: true,
      output: JSON.stringify(plan),
      metadata: {
        type: "plan",
        plan,
      },
    };
  },
};

// ─── mark_step_complete ──────────────────────────────────

export const markStepCompleteTool: Tool = {
  name: "mark_step_complete",
  description:
    "Mark a plan step as completed during build execution. Call this after you finish implementing a step from the active plan.",
  parameters: {
    type: "object",
    required: ["stepId", "planId"],
    properties: {
      stepId: { type: "string" },
      planId: { type: "string" },
    },
  },

  async execute(
    params: Record<string, unknown>,
    _ctx: ToolContext,
  ): Promise<ToolResult> {
    const stepId = params.stepId as string;
    const planId = params.planId as string;

    if (!stepId || typeof stepId !== "string") {
      return {
        success: false,
        output: "",
        error: "stepId is required and must be a string",
      };
    }

    if (!planId || typeof planId !== "string") {
      return {
        success: false,
        output: "",
        error: "planId is required and must be a string",
      };
    }

    return {
      success: true,
      output: JSON.stringify({ planId, stepId, status: "completed" }),
      metadata: {
        type: "plan_step_update",
        planId,
        stepId,
      },
    };
  },
};
