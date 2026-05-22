/**
 * Security scanner pattern definitions — secret detection and code quality.
 */

// ─── Secret Patterns ────────────────────────────────────────

export interface SecretPattern {
  name: string;
  regex: RegExp;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  fix: string;
}

export const SECRET_PATTERNS: SecretPattern[] = [
  {
    name: "AWS Access Key",
    regex: /AKIA[0-9A-Z]{16}/g,
    severity: "critical",
    description: "AWS access key ID found in source code. This could allow unauthorized access to AWS resources.",
    fix: "Move the AWS key to environment variables. Use AWS_ACCESS_KEY_ID env var instead.",
  },
  {
    name: "AWS Secret Key",
    regex: /(?:aws_secret_access_key|aws_secret)\s*[=:]\s*['"][A-Za-z0-9/+=]{40}['"]/gi,
    severity: "critical",
    description: "AWS secret access key found in source code.",
    fix: "Move the AWS secret to environment variables. Use AWS_SECRET_ACCESS_KEY env var instead.",
  },
  {
    name: "Private Key",
    regex: /-----BEGIN\s+(RSA|EC|DSA|OPENSSH|PGP)?\s*PRIVATE KEY-----/g,
    severity: "critical",
    description: "Private key found in source code. This is a severe security risk.",
    fix: "Remove the private key from source code. Store it securely and reference via file path in env vars.",
  },
  {
    name: "Generic API Key",
    regex: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[=:]\s*['"][a-zA-Z0-9_\-]{20,}['"]/gi,
    severity: "high",
    description: "Hardcoded API key detected. API keys should be stored in environment variables.",
    fix: "Move the API key to a .env file and access via process.env. Add the key name to .env.example.",
  },
  {
    name: "Secret/Token Assignment",
    regex: /(?:secret|token|password|passwd|pwd)\s*[=:]\s*['"][a-zA-Z0-9_\-!@#$%^&*]{8,}['"]/gi,
    severity: "high",
    description: "Hardcoded secret or token detected in source code.",
    fix: "Move the secret to environment variables. Never commit secrets to version control.",
  },
  {
    name: "Database URL",
    regex: /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s'"]+:[^\s'"]+@[^\s'"]+/gi,
    severity: "high",
    description: "Database connection string with credentials found in source code.",
    fix: "Move the database URL to DATABASE_URL environment variable.",
  },
  {
    name: "JWT Secret",
    regex: /(?:jwt[_-]?secret|jwt[_-]?key)\s*[=:]\s*['"][a-zA-Z0-9_\-!@#$%^&*]{8,}['"]/gi,
    severity: "high",
    description: "Hardcoded JWT secret found. This could allow token forgery.",
    fix: "Move the JWT secret to JWT_SECRET environment variable.",
  },
  {
    name: "Stripe Key",
    regex: /(?:sk|pk)_(?:live|test)_[a-zA-Z0-9]{20,}/g,
    severity: "high",
    description: "Stripe API key found in source code.",
    fix: "Move the Stripe key to STRIPE_SECRET_KEY or STRIPE_PUBLISHABLE_KEY environment variables.",
  },
  {
    name: "GitHub Token",
    regex: /gh[pousr]_[A-Za-z0-9_]{36,}/g,
    severity: "high",
    description: "GitHub personal access token found in source code.",
    fix: "Move the GitHub token to an environment variable (e.g., GITHUB_TOKEN).",
  },
  {
    name: "Slack Token",
    regex: /xox[baprs]-[0-9]{10,}-[a-zA-Z0-9-]+/g,
    severity: "high",
    description: "Slack API token found in source code.",
    fix: "Move the Slack token to an environment variable.",
  },
  {
    name: "SendGrid API Key",
    regex: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g,
    severity: "high",
    description: "SendGrid API key found in source code.",
    fix: "Move the SendGrid key to SENDGRID_API_KEY environment variable.",
  },
  {
    name: "Hardcoded Password",
    regex: /(?:password|passwd|pwd)\s*[=:]\s*['"][^'"]{4,}['"]/gi,
    severity: "medium",
    description: "Potential hardcoded password detected.",
    fix: "Move passwords to environment variables or use a secrets manager.",
  },
];

// ─── Code Quality Patterns ──────────────────────────────────

export interface CodeQualityPattern {
  name: string;
  regex: RegExp;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  fix: string;
}

export const CODE_QUALITY_PATTERNS: CodeQualityPattern[] = [
  {
    name: "eval() usage",
    regex: /\beval\s*\(/g,
    severity: "high",
    description: "eval() executes arbitrary code and is a major security risk. It can lead to code injection attacks.",
    fix: "Replace eval() with JSON.parse() for JSON data, or use Function constructor for dynamic code (with extreme caution).",
  },
  {
    name: "innerHTML assignment",
    regex: /\.innerHTML\s*=/g,
    severity: "medium",
    description: "Setting innerHTML directly can lead to XSS (Cross-Site Scripting) attacks if the content is user-controlled.",
    fix: "Use textContent for plain text, or use a sanitization library (e.g., DOMPurify) before setting innerHTML.",
  },
  {
    name: "document.write()",
    regex: /document\.write\s*\(/g,
    severity: "medium",
    description: "document.write() can be exploited for XSS attacks and causes performance issues.",
    fix: "Use DOM manipulation methods (createElement, appendChild) instead of document.write().",
  },
  {
    name: "SQL injection pattern",
    regex: /(?:query|execute|sql)\s*\(\s*[`'"].*\$\{/g,
    severity: "high",
    description: "Potential SQL injection: string interpolation used in a database query.",
    fix: "Use parameterized queries or prepared statements instead of string interpolation in SQL.",
  },
  {
    name: "Insecure HTTP URL",
    regex: /['"]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)[^'"]+['"]/g,
    severity: "low",
    description: "Non-HTTPS URL found. Data transmitted over HTTP is not encrypted.",
    fix: "Use HTTPS URLs for all external resources and API endpoints.",
  },
  {
    name: "Disabled security check",
    regex: /(?:verify|validate|check|secure)\s*[=:]\s*false/gi,
    severity: "medium",
    description: "Security check appears to be disabled.",
    fix: "Review whether this security check should be enabled. Never disable security checks in production.",
  },
  {
    name: "Console.log with sensitive data",
    regex: /console\.log\s*\(.*(?:password|secret|token|key|credential)/gi,
    severity: "medium",
    description: "Sensitive data may be logged to console, which could expose it in production logs.",
    fix: "Remove console.log statements containing sensitive data, or use a proper logging library with redaction.",
  },
  {
    name: "Unsafe regex (ReDoS)",
    regex: /new RegExp\s*\([^)]*\+/g,
    severity: "low",
    description: "Dynamic regex construction could be vulnerable to ReDoS (Regular Expression Denial of Service).",
    fix: "Validate and sanitize user input before using it in regular expressions, or use static regex patterns.",
  },
];
