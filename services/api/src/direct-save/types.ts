export interface SourceLocation {
  file: string;   // relative path e.g. "src/App.tsx"
  line: number;   // 1-based
  col: number;    // 0-based
}

export interface DirectSaveChange {
  type: "text" | "style";
  oldText?: string;
  newText?: string;
  property?: string;  // CSS property (camelCase)
  value?: string;     // New CSS value
}

export interface DirectSaveRequest {
  sourceLocation: SourceLocation;
  changes: DirectSaveChange[];
}

export interface ChangeResult {
  type: "text" | "style";
  property?: string;
  success: boolean;
  reason?: string;
}

export interface DirectSaveResponse {
  success: boolean;
  file: string;
  applied: ChangeResult[];
  failedCount: number;
}
