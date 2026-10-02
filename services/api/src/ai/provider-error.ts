/** Preserve protocol error codes through policy decisions; localize only at display time. */
export function classifyProviderError(error: unknown): string {
  const data =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const status = Number(data.statusCode ?? data.status);
  const code = String(data.code ?? data.errorType ?? "").toLowerCase();
  const message = String(
    data.message ?? data.error ?? error ?? "",
  ).toLowerCase();
  if (
    status === 401 ||
    status === 403 ||
    /^(invalid_api_key|authentication_error|permission_denied)$/.test(code)
  )
    return "AUTH";
  if (/^(insufficient_quota|quota_exceeded|insufficient_balance)$/.test(code))
    return "QUOTA";
  if (status === 429 || /^(rate_limit_exceeded|rate_limit_error)$/.test(code))
    return "RATE_LIMIT";
  if (
    status === 408 ||
    status === 504 ||
    /^(timeout|request_timeout)$/.test(code)
  )
    return "TIMEOUT";
  if (status >= 500 && status <= 599) return "SERVER";
  if (status === 404) return "NOT_FOUND";
  // Compatibility with providers that omit structured metadata (not UI text).
  if (/quota|insufficient.?balance|余额不足|配额|额度不足/.test(message))
    return "QUOTA";
  if (
    /rate.?limit|too many requests|\b429\b|请求过于频繁|限流|请求频率/.test(
      message,
    )
  )
    return "RATE_LIMIT";
  if (
    /unauthorized|forbidden|authentication|\b40[13]\b|认证失败|鉴权失败|无效.{0,8}密钥/.test(
      message,
    )
  )
    return "AUTH";
  if (/timeout|timed out|deadline|超时/.test(message)) return "TIMEOUT";
  if (/network|econn|enotfound|dns|socket|网络/.test(message)) return "NETWORK";
  if (/not found|\b404\b/.test(message)) return "NOT_FOUND";
  if (
    /\b50[0-9]\b|internal server|bad gateway|service unavailable/.test(message)
  )
    return "SERVER";
  return "UNKNOWN";
}
