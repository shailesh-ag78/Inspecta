"use client";

import { useDashboard } from "@/lib/context";
import { Settings, Shield, Bell, Key, Save } from "lucide-react";
import React, { useState } from "react";

export default function ConfigurationPage() {
  const { theme } = useDashboard();
  const [notifications, setNotifications] = useState(true);
  const [safetyAlerts, setSafetyAlerts] = useState(true);

  return (
    <div className={`h-full overflow-y-auto p-6 ${theme.background.section} text-white`}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Settings className="w-8 h-8 text-blue-400" />
          <h1 className="text-3xl font-black tracking-tight">Configuration</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Safety Settings */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-5 h-5 text-green-400" />
              <h2 className="text-lg font-bold">Safety & Compliance</h2>
            </div>
            <p className="text-xs text-slate-400 mb-6">Manage real-time hazard detection alerts and AI scoring sensitivity.</p>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Strict PPE Detection</div>
                  <div className="text-[11px] text-slate-400">Flag missing helmets and vests automatically.</div>
                </div>
                <input
                  type="checkbox"
                  checked={safetyAlerts}
                  onChange={() => setSafetyAlerts(!safetyAlerts)}
                  className="w-4 h-4 accent-blue-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Alert Settings */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <Bell className="w-5 h-5 text-yellow-400" />
              <h2 className="text-lg font-bold">Alert Notifications</h2>
            </div>
            <p className="text-xs text-slate-400 mb-6">Configure how alert notifications are dispatched to operators.</p>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Push Notifications</div>
                  <div className="text-[11px] text-slate-400">Receive instant sound alarms in browser dashboard.</div>
                </div>
                <input
                  type="checkbox"
                  checked={notifications}
                  onChange={() => setNotifications(!notifications)}
                  className="w-4 h-4 accent-blue-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* API and Integration Keys */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-xl md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <Key className="w-5 h-5 text-purple-400" />
              <h2 className="text-lg font-bold">API Integrations</h2>
            </div>
            <p className="text-xs text-slate-400 mb-6">Integration keys for connecting to site sensors and external feeds.</p>
            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-300">Edge Stream API Gateway</label>
              <div className="flex gap-3">
                <input
                  type="text"
                  readOnly
                  value="https://api.inspecta.ai/v1/gateway/edge_stream_592b"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm font-mono text-slate-300 outline-none"
                />
                <button className={`bg-gradient-to-r ${theme.primary.from} ${theme.primary.to} hover:brightness-110 transition-all text-white text-xs font-bold px-4 py-2 rounded-xl cursor-pointer`}>
                  Copy URI
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-8">
          <button className={`flex items-center gap-2 bg-gradient-to-r ${theme.primary.from} ${theme.primary.to} hover:brightness-110 transition-all font-bold px-6 py-3 rounded-2xl cursor-pointer`}>
            <Save className="w-4 h-4" />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
