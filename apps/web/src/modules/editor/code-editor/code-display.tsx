"use client";

import { useCallback, useMemo, useState } from "react";
import { Copy, Check } from "lucide-react";

// ─── Syntax Highlighting (CSS class-based) ──────────────────
interface Token {
  text: string;
  className: string;
}

function tokenize(code: string, language: string): Token[][] {
  const lines = code.split("\n");

  return lines.map((line) => {
    if (!line.trim()) return [{ text: line || " ", className: "" }];

    const tokens: Token[] = [];
    let remaining = line;

    // Simple regex-based tokenizer
    const patterns: [RegExp, string][] = getPatterns(language);

    while (remaining.length > 0) {
      let matched = false;

      for (const [regex, className] of patterns) {
        const match = remaining.match(regex);
        if (match && match.index === 0) {
          tokens.push({ text: match[0], className });
          remaining = remaining.slice(match[0].length);
          matched = true;
          break;
        }
      }

      if (!matched) {
        // Accumulate plain text
        const char = remaining[0] ?? "";
        const last = tokens[tokens.length - 1];
        if (last && last.className === "") {
          last.text += char;
        } else {
          tokens.push({ text: char, className: "" });
        }
        remaining = remaining.slice(1);
      }
    }

    return tokens;
  });
}

function getPatterns(language: string): [RegExp, string][] {
  const common: [RegExp, string][] = [
    [/^\/\/.*/, "text-emerald-600 dark:text-emerald-400"], // line comment
    [/^\/\*[\s\S]*?\*\//, "text-emerald-600 dark:text-emerald-400"], // block comment
    [/^"(?:[^"\\]|\\.)*"/, "text-amber-600 dark:text-amber-400"], // double string
    [/^'(?:[^'\\]|\\.)*'/, "text-amber-600 dark:text-amber-400"], // single string
    [/^`(?:[^`\\]|\\.)*`/, "text-amber-600 dark:text-amber-400"], // template string
    [/^\d+(?:\.\d+)?/, "text-blue-600 dark:text-blue-400"], // number
  ];

  const tsKeywords =
    /^(?:import|export|from|const|let|var|function|return|if|else|for|while|class|interface|type|extends|implements|new|this|async|await|try|catch|throw|default|switch|case|break|continue|typeof|instanceof|in|of|as|void|null|undefined|true|false)\b/;

  const cssKeywords =
    /^(?:@import|@media|@keyframes|@layer|@apply|@tailwind)\b/;

  const jsonKeywords = /^(?:true|false|null)\b/;

  switch (language) {
    case "typescript":
    case "tsx":
    case "javascript":
    case "jsx":
      return [
        ...common,
        [tsKeywords, "text-brand-600 dark:text-brand-400"],
        [/^<\/?[\w.-]+/, "text-rose-600 dark:text-rose-400"], // JSX tags
        [/^\/>/, "text-rose-600 dark:text-rose-400"],
        [/^=>/, "text-brand-600 dark:text-brand-400"],
        [/^[{}()\[\];,.]/, "text-muted-foreground"],
      ];

    case "css":
      return [
        ...common,
        [cssKeywords, "text-brand-600 dark:text-brand-400"],
        [/^[.#][\w-]+/, "text-rose-600 dark:text-rose-400"], // selectors
        [/^[\w-]+(?=\s*:)/, "text-blue-600 dark:text-blue-400"], // properties
        [/^[{}();,:]/, "text-muted-foreground"],
      ];

    case "json":
      return [
        [/^"(?:[^"\\]|\\.)*"\s*(?=:)/, "text-blue-600 dark:text-blue-400"], // keys
        [/^"(?:[^"\\]|\\.)*"/, "text-amber-600 dark:text-amber-400"], // values
        [jsonKeywords, "text-brand-600 dark:text-brand-400"],
        [/^\d+(?:\.\d+)?/, "text-blue-600 dark:text-blue-400"],
        [/^[{}()\[\],:]/, "text-muted-foreground"],
      ];

    default:
      return common;
  }
}

// ─── Component ──────────────────────────────────────────────
interface CodeDisplayProps {
  code: string;
  language: string;
  fileName?: string;
}

export function CodeDisplay({ code, language, fileName }: CodeDisplayProps) {
  const [copied, setCopied] = useState(false);

  const tokenizedLines = useMemo(
    () => tokenize(code, language),
    [code, language]
  );

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const lineCount = tokenizedLines.length;
  const gutterWidth = Math.max(String(lineCount).length * 10 + 16, 40);

  return (
    <div className="group relative h-full overflow-auto bg-[hsl(var(--background))] font-mono text-[13px] leading-[20px]">
      {/* Copy button */}
      <button
        onClick={handleCopy}
        className="absolute right-3 top-3 z-10 flex h-7 items-center gap-1.5 rounded-md border border-border bg-background/90 px-2 text-xs text-muted-foreground shadow-sm backdrop-blur hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? (
          <>
            <Check className="h-3 w-3 text-green-500" />
            Copied
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" />
            Copy
          </>
        )}
      </button>

      {/* Code content */}
      <table className="w-full border-collapse">
        <tbody>
          {tokenizedLines.map((tokens, lineIndex) => (
            <tr
              key={lineIndex}
              className="hover:bg-muted/30 transition-colors"
            >
              {/* Line number */}
              <td
                className="sticky left-0 select-none bg-[hsl(var(--background))] px-3 text-right text-muted-foreground/50 align-top"
                style={{ width: gutterWidth, minWidth: gutterWidth }}
              >
                {lineIndex + 1}
              </td>

              {/* Code */}
              <td className="px-4 whitespace-pre">
                {tokens.map((token, tokenIndex) => (
                  <span key={tokenIndex} className={token.className}>
                    {token.text}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
