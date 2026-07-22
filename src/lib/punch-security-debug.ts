export function punchSecurityDebugEnabled(): boolean {
  return (
    process.env.PUNCH_SECURITY_DEBUG === "1" ||
    process.env.NODE_ENV === "development"
  );
}

export function punchSecurityDebugLog(
  label: string,
  data: Record<string, unknown>,
): void {
  if (!punchSecurityDebugEnabled()) return;
  console.log(`[punch-security] ${label}`, data);
}
