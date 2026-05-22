import type { ContextMergeStrategy } from "@doable/shared";
import type { ContextFileDefinition } from "./defaults-core.js";

export const EXTENDED_CONTEXT_FILES: ContextFileDefinition[] = [
  // ─── P0.5: Session lifecycle ─────────────────────────────
  {
    filename: "boot.md",
    displayName: "Boot",
    description: "Session startup checklist — runs at the beginning of every AI session.",
    priority: 10,
    alwaysInclude: false,
    mergeStrategy: "append",
    category: "session",
    defaultContent: `# Boot — Session Startup

<!-- This runs at the start of every AI session. Use it for reminders, setup checks, or context loading. -->

## Checklist
- [ ] Read the current plan and memory
- [ ] Check for any known issues before starting
- [ ] Confirm the user's current goal
`,
  },
  {
    filename: "tools.md",
    displayName: "Tools",
    description: "Tool usage notes, custom tool configs, and conventions.",
    priority: 11,
    alwaysInclude: false,
    mergeStrategy: "append",
    category: "session",
    defaultContent: `# Tools

## Tool Notes
<!-- Notes about how tools should be used in this project -->

## Custom Conventions
<!-- Any project-specific tool usage patterns -->
`,
  },
  {
    filename: "heartbeat.md",
    displayName: "Heartbeat",
    description: "Periodic health checks — reviewed every N interactions.",
    priority: 12,
    alwaysInclude: false,
    mergeStrategy: "replace",
    category: "session",
    defaultContent: `# Heartbeat — Periodic Checks

<!-- Reviewed periodically during long sessions. Use for quality gates and sanity checks. -->

## Health Checks
- [ ] Are all files syntactically valid?
- [ ] Is the preview still loading correctly?
- [ ] Have any new errors appeared in the console?
`,
  },
  {
    filename: "bootstrap.md",
    displayName: "Bootstrap",
    description: "One-time workspace setup — self-deletes after completion.",
    priority: 13,
    alwaysInclude: false,
    mergeStrategy: "replace",
    category: "session",
    defaultContent: `# Bootstrap — First-Time Setup

<!-- This runs once when the workspace is first created. Delete this file when setup is complete. -->

## Setup Steps
1. Configure the project identity
2. Set up the knowledge base with your tech stack
3. Define coding instructions and conventions
4. Customize the soul with your design vision
`,
  },

  // ─── P1: Architecture & design ───────────────────────────
  {
    filename: "design-system.md",
    displayName: "Design System",
    description: "Visual design constraints — colors, fonts, spacing, component patterns.",
    priority: 20,
    alwaysInclude: false,
    mergeStrategy: "replace",
    category: "architecture",
    defaultContent: `# Design System

## Colors
<!-- Define your color palette -->

## Typography
<!-- Font families, sizes, weights -->

## Spacing
<!-- Grid system, margins, padding conventions -->

## Component Patterns
<!-- Reusable UI patterns specific to this project -->
`,
  },
  {
    filename: "schema.md",
    displayName: "Schema",
    description: "Database schema documentation — tables, relationships, constraints.",
    priority: 21,
    alwaysInclude: false,
    mergeStrategy: "replace",
    category: "architecture",
    defaultContent: `# Database Schema

<!-- Document your data model here. Can be auto-generated from your DB. -->

## Tables
<!-- List tables with their key columns and relationships -->

## Relationships
<!-- Describe foreign keys and joins -->
`,
  },
  {
    filename: "architecture.md",
    displayName: "Architecture",
    description: "System architecture decisions — service boundaries, data flow, patterns.",
    priority: 22,
    alwaysInclude: false,
    mergeStrategy: "replace",
    category: "architecture",
    defaultContent: `# Architecture

## Overview
<!-- High-level system architecture -->

## Key Decisions
<!-- ADRs (Architecture Decision Records) -->

## Data Flow
<!-- How data moves through the system -->

## Patterns
<!-- Design patterns used and why -->
`,
  },
  {
    filename: "api-reference.md",
    displayName: "API Reference",
    description: "External API documentation — endpoints, auth, rate limits.",
    priority: 23,
    alwaysInclude: false,
    mergeStrategy: "append",
    category: "architecture",
    defaultContent: `# API Reference

<!-- Document external APIs your project integrates with -->

## Endpoints
<!-- List API endpoints with methods and parameters -->

## Authentication
<!-- How to authenticate with external APIs -->

## Rate Limits
<!-- Any rate limiting to be aware of -->
`,
  },

  // ─── P3: Agent definitions ───────────────────────────────
  {
    filename: "agents.md",
    displayName: "Agents",
    description: "Custom agent definitions for specialized tasks.",
    priority: 30,
    alwaysInclude: false,
    mergeStrategy: "append",
    category: "agents",
    defaultContent: `# Custom Agents

<!-- Define specialized agents for different tasks -->

## Example Agent
<!--
name: reviewer
description: Code review specialist
prompt: You are a code review agent. Focus on correctness, performance, and maintainability.
-->
`,
  },
];
