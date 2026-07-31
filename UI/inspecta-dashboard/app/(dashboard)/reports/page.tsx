"use client";

import { useDashboard } from "@/lib/context";
import { AlertCircle } from "lucide-react";

export default function ReportsPage() {
  const { theme } = useDashboard();
  
  return (
    <div className={`h-full flex flex-col items-center justify-center p-6 bg-gradient-to-br ${theme.background.section}`}>
      <div className="text-center bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-12 max-w-lg shadow-2xl">
        <AlertCircle className="w-16 h-16 text-blue-400 mx-auto mb-6 opacity-80" />
        <h2 className="text-2xl font-black text-white mb-3 tracking-tight">Reports Overview</h2>
        <p className="text-slate-400 text-sm leading-relaxed">
          This section is currently under development. The metrics, summary analytics, and reports will be displayed here soon.
        </p>
      </div>
    </div>
  );
}
