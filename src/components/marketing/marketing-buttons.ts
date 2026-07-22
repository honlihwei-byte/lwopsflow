export function btnPrimary(className = "") {
  return `inline-flex min-h-[2.75rem] items-center justify-center rounded-xl bg-[#2563EB] px-6 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB] ${className}`;
}

export function btnSecondary(className = "") {
  return `inline-flex min-h-[2.75rem] items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-center text-sm font-semibold text-[#0F172A] shadow-sm transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-300 ${className}`;
}
