"use client";

import { DashboardProvider, useDashboard } from "@/lib/context";
import { ChevronDown, Loader, LogOut, User, Plus, Upload, Gauge, ClipboardList, ListTodo, Menu, ChevronLeft, Bell, Settings } from "lucide-react";
import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AddInspectionModal from "@/components/AddInspectionModal";
import IncidentSelectionPane from "@/components/IncidentSelectionPane";
import { themes } from "@/lib/themes";

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const {
    user,
    theme,
    setTheme,
    companyName,
    companyNameLoading,
    siteInspections,
    selectedInspection,
    setSelectedInspection,
    siteInspectionsLoading,
    incidents,
    selectedIncidentId,
    setSelectedIncidentId,
    incidentsLoading,
    isAddInspectionOpen,
    setIsAddInspectionOpen,
    uniqueSites,
    handleAddInspectionSubmit,
    handleLogin,
    handleLogout,
    authLoading,
    headerSiteName,
    headerInspectionName,
  } = useDashboard();

  // Settings menu state
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [isInspectionDropdownOpen, setIsInspectionDropdownOpen] = useState(false);
  const [isIncidentDropdownOpen, setIsIncidentDropdownOpen] = useState(false);
  const flexContainerRef = useRef<HTMLDivElement | null>(null);
  const inspectionDropdownRef = useRef<HTMLDivElement | null>(null);
  const incidentDropdownRef = useRef<HTMLDivElement | null>(null);

  const pathname = usePathname();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (inspectionDropdownRef.current && !inspectionDropdownRef.current.contains(event.target as Node)) {
        setIsInspectionDropdownOpen(false);
      }
      if (incidentDropdownRef.current && !incidentDropdownRef.current.contains(event.target as Node)) {
        setIsIncidentDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const renderSettingsMenu = (isMobile: boolean) => {
    return (
      <div className={`${isMobile ? 'flex sm:hidden' : 'hidden sm:flex'} items-center gap-3 shrink-0`}>
        {/* Notification Bell */}
        <button
          className="text-white/60 hover:text-white transition-colors p-1.5 hover:bg-white/10 rounded-full cursor-pointer relative"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full"></span>
        </button>

        <div className="relative">
          <button
            onClick={() => setShowSettingsMenu(!showSettingsMenu)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white overflow-hidden transition hover:bg-white/20 cursor-pointer"
            title="Profile Settings"
          >
            {user?.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || "User"} className="h-full w-full object-cover" />
            ) : (
              <User className="w-3.5 h-3.5" />
            )}
          </button>
          {showSettingsMenu && (
            <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-slate-900 border border-slate-700 shadow-xl z-50">
              <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-3">
                {user?.photoURL && (
                  <img src={user.photoURL} alt="" className="h-10 w-10 rounded-full border border-slate-700" />
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-white truncate">{user?.displayName || "Task Reviewer"}</div>
                  <div className="text-xs text-slate-400 truncate">{user?.email}</div>
                </div>
              </div>
              <div className="p-2 border-b border-slate-800">
                <div className="px-3 py-2 text-xs font-medium text-slate-300 uppercase tracking-wider">Theme</div>
                {Object.values(themes)
                  .map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setTheme(t);
                        setShowSettingsMenu(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all mb-1 cursor-pointer ${theme.id === t.id
                        ? 'bg-white/10 text-white'
                        : 'hover:bg-slate-800 text-slate-200'
                        }`}
                    >
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs opacity-75 mt-1">
                        <div className={`h-2 rounded w-full bg-gradient-to-r ${t.primary.from} ${t.primary.to}`}></div>
                      </div>
                    </button>
                  ))}
              </div>
              <div className="p-2 border-t border-slate-800">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (authLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-950 text-blue-500">
        <Loader className="w-12 h-12 animate-spin mb-4" />
        <p className="text-sm font-medium animate-pulse">Initializing security module...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black text-white p-6 relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-blue-50/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-50/10 blur-[120px] pointer-events-none" />

        <div className="w-full max-w-md bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-[28px] p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] relative z-10 transition-all hover:border-white/20">
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-full bg-blue-50/20 blur-md animate-pulse" />
              <img src="/InspectaLogo.png" alt="Inspecta Logo" className="relative h-20 w-20 rounded-full object-cover border border-white/20" />
            </div>

            <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-blue-400 via-orange-400 to-purple-400 text-transparent bg-clip-text">
              INSPECTA
            </h1>
            <p className="text-slate-400 text-sm mt-2 font-medium">Inspection simplified by technology</p>

            <div className="h-[1px] w-full bg-white/10 my-6" />

            <h2 className="text-xl font-bold text-white mb-2">Access Granted via Google Auth</h2>
            <p className="text-xs text-slate-400 max-w-xs mb-8">
              Authenticate using your company Google Workspace account to securely view task evidence and inspections.
            </p>

            <button
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-white text-slate-950 font-bold rounded-2xl shadow-lg transition-all hover:bg-slate-100 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign in with Google
            </button>
          </div>
        </div>

        <div className="absolute bottom-6 text-[10px] text-slate-600 font-mono">
          SECURE CONNECTION • AES-256 ENCRYPTION
        </div>
      </div>
    );
  }

  const activeInspectionObj = siteInspections.find(item => (item.inspection_id || item.site_id) === selectedInspection);
  const siteName = headerSiteName || activeInspectionObj?.site_name || "All Sites";
  const inspectionName = headerInspectionName || activeInspectionObj?.label || "All Inspections";

  const sidebarBg = theme.id === 'blueTeal'
    ? theme.header.bg
    : theme.header.bg.replace(/bg-gradient-to-r/g, 'bg-gradient-to-b');

  return (
    <div className={`h-screen flex bg-gradient-to-br ${theme.background.gradient} overflow-hidden`}>
      {/* Collapsible Left Sidebar */}
      <aside className={`hidden sm:flex h-full border-r border-slate-300/20 ${sidebarBg} flex-col transition-all duration-300 ${isSidebarCollapsed ? 'w-16' : 'w-52'} shrink-0 relative z-30`}>
        {/* Top Header in Sidebar: Logo and Name */}
        <div className="flex flex-col border-b border-slate-300/20">
          <div
            className={`flex items-center ${isSidebarCollapsed ? 'justify-center px-0 cursor-pointer' : 'justify-between px-4'} h-12`}
            onClick={() => { if (isSidebarCollapsed) setIsSidebarCollapsed(false); }}
            title={isSidebarCollapsed ? "Expand Sidebar" : undefined}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <img src="/InspectaLogo.png" alt="Logo" className="h-8 w-8 rounded-full object-cover shrink-0 drop-shadow-[0_0_12px_rgba(59,130,246,0.7)] border border-white/10" />
              {!isSidebarCollapsed && (
                <div>
                  <div className="text-sm tracking-[0.2em] font-black 
                    bg-gradient-to-r from-blue-300 via-orange-300 to-purple-300 
                    text-transparent bg-clip-text drop-shadow-md">
                    INSPECTA
                  </div>
                </div>
              )}
            </div>
            {!isSidebarCollapsed && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSidebarCollapsed(true);
                }}
                className="text-white/60 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-lg cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Sidebar Navigation Pages Links */}
        <nav className="flex-1 px-3 py-4 flex flex-col items-center sm:items-stretch gap-2">
          {[
            { path: "/taskmanagement", label: "Task List", icon: "/task-list.ico" as any },
            { path: "/inspection", label: "Inspection", icon: "/Inspection.ico" as any },
            { path: "/reports", label: "Reports", icon: "/reports.ico" as any },
            { path: "/configuration", label: "Configuration", icon: "/conifguration.ico" as any },
          ].map((tab) => {
            const isActive = pathname === tab.path || (tab.path === "/inspection" && pathname === "/");
            const Icon = tab.icon;
            const isConfig = tab.path === "/configuration";
            return (
              <Link
                key={tab.path}
                href={tab.path}
                title={isSidebarCollapsed ? tab.label : undefined}
                className={`flex items-center transition-all ${isSidebarCollapsed
                  ? "justify-center w-10 h-10 rounded-xl"
                  : "gap-4 px-3 py-2 rounded-xl text-base font-semibold tracking-wide w-full"
                  } ${isActive
                    ? "bg-white/15 text-white border border-white/10 shadow-sm"
                    : "text-white/60 hover:text-white hover:bg-white/5 border border-transparent"
                  }`}
              >
                {isSidebarCollapsed ? (
                  typeof Icon === 'string' ? (
                    <img src={Icon} alt="" className={`w-[28px] h-[28px] object-contain shrink-0 ${isConfig ? 'p-[2px]' : ''}`} />
                  ) : (
                    <Icon className={`w-[22px] h-[22px] shrink-0 ${isActive ? "text-blue-400" : "text-white/80"}`} />
                  )
                ) : (
                  <div className={`flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${isActive ? "bg-white/15" : "bg-white/5"}`}>
                    {typeof Icon === 'string' ? (
                      <img src={Icon} alt="" className={`w-9 h-9 object-contain ${isConfig ? 'p-[3px]' : ''}`} />
                    ) : (
                      <Icon className={`w-7 h-7 ${isActive ? "text-blue-400" : "text-white/80"}`} />
                    )}
                  </div>
                )}
                {!isSidebarCollapsed && <span>{tab.label}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className={`${theme.header.bg} ${theme.header.text} shrink-0 border-b border-slate-300/20 shadow-lg h-12 flex items-center`}>
          <div className="max-w-[1600px] w-full mx-auto px-4 lg:px-6 flex items-center justify-between h-full">
            <div className="flex items-center justify-between w-full sm:w-auto gap-6 h-full">
              <div className="flex items-center gap-3">
                {/* Mobile Hamburger menu */}
                <button
                  onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                  className="text-white/60 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-lg mr-1 cursor-pointer sm:hidden"
                >
                  <Menu className="w-5 h-5" />
                </button>
                <div className="text-base font-black text-white/80 truncate leading-normal " title={companyName || "Inspecta"}>
                  {companyName || "Inspecta"}
                </div>
              </div>

              {/* Mobile Settings Menu */}
              {renderSettingsMenu(true)}
            </div>

            {/* Mobile Navigation overlay (only when screen is very small and sidebar is toggled open) */}
            {!isSidebarCollapsed && (
              <div className="sm:hidden absolute top-[48px] left-0 right-0 bg-slate-900/95 border-b border-slate-700/80 z-40 p-4 flex flex-col gap-2">
                {[
                  { path: "/taskmanagement", label: "Task List", icon: "/task-list.ico" as any },
                  { path: "/inspection", label: "Inspection", icon: "/Inspection.ico" as any },
                ].map((tab) => {
                  const isActive = pathname === tab.path || (tab.path === "/inspection" && pathname === "/");
                  const Icon = tab.icon;
                  return (
                    <Link
                      key={tab.path}
                      onClick={() => setIsSidebarCollapsed(true)}
                      href={tab.path}
                      className={`flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${isActive ? "bg-white/10 text-white font-bold" : "text-white/60"
                        }`}
                    >
                      <div className={`flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${isActive ? "bg-white/15" : "bg-white/5"}`}>
                        {typeof Icon === 'string' ? (
                          <img src={Icon} alt="" className="w-8 h-8 object-contain" />
                        ) : (
                          <Icon className={`w-6 h-6 ${isActive ? "text-blue-400" : "text-white/80"}`} />
                        )}
                      </div>
                      <span>{tab.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end w-full sm:w-auto">
              {/* Desktop Settings Menu */}
              {renderSettingsMenu(false)}
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {pathname !== "/inspection" && (
            <IncidentSelectionPane 
              key={pathname} 
              singleSiteMode={pathname === "/reports"} 
              defaultShowIncidents={pathname !== "/reports"}
              defaultShowFieldNotes={pathname === "/reports"}
            />
          )}
          <div className="flex-1 overflow-hidden">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProvider>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </DashboardProvider>
  );
}
