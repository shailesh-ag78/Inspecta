"use client";

import React, { useState } from "react";
import { useDashboard } from "@/lib/context";
import { ChevronDown, BarChart2 } from "lucide-react";
import { ReportingIncidents } from "@/components/ReportingIncidents";
import { ReportingCanvas } from "@/components/ReportingCanvas";

export default function ReportsPage() {
  const { theme, millerIncidents, selectedMillerIncidents, setSelectedMillerIncidents, setIsIncidentPaneCollapsed } = useDashboard();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [droppedIncidents, setDroppedIncidents] = useState<any[]>([]);
  const [selectedIncidentIds, setSelectedIncidentIds] = useState<string[]>([]);

  // Expand IncidentSelectionPane by default on this page
  React.useEffect(() => {
    setIsIncidentPaneCollapsed(false);
  }, [setIsIncidentPaneCollapsed]);

  // Derive incidents filtered by IncidentSelectionPane choices
  const displayedIncidents = React.useMemo(() => {
    if (selectedMillerIncidents.length === 0) return [];
    return millerIncidents.filter((inc) => selectedMillerIncidents.includes(inc.id));
  }, [millerIncidents, selectedMillerIncidents]);

  // Auto-prune canvas tiles if they are removed from the refreshed incident list
  React.useEffect(() => {
    setDroppedIncidents((prev) => {
      if (prev.length === 0) return prev;
      const validIds = new Set(displayedIncidents.map((inc) => inc.id));
      const filtered = prev.filter((item) => validIds.has(item.id));
      if (filtered.length !== prev.length) {
        return filtered;
      }
      return prev;
    });
  }, [displayedIncidents]);

  // HTML5 Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, incidentId: string) => {
    const dragIds = selectedIncidentIds.includes(incidentId)
      ? selectedIncidentIds
      : [incidentId];
    e.dataTransfer.setData("application/json", JSON.stringify(dragIds));
    e.dataTransfer.setData("text/plain", incidentId);
  };

  const handleDrop = (e: React.DragEvent, index?: number) => {
    e.preventDefault();
    let idsToDrop: string[] = [];
    const jsonStr = e.dataTransfer.getData("application/json");
    if (jsonStr) {
      try {
        idsToDrop = JSON.parse(jsonStr);
      } catch (err) { }
    }
    if (idsToDrop.length === 0) {
      const fallbackId = e.dataTransfer.getData("text/plain");
      if (fallbackId) idsToDrop = [fallbackId];
    }

    if (idsToDrop.length === 0) return;

    setDroppedIncidents((prev) => {
      // Find objects for idsToDrop (checking prev first, then millerIncidents)
      const objectsToDrop: any[] = idsToDrop
        .map((id) => prev.find((item) => item.id === id) || millerIncidents.find((inc) => inc.id === id))
        .filter(Boolean);

      if (objectsToDrop.length === 0) return prev;

      const dropIdSet = new Set(idsToDrop);
      const rawTargetIndex = typeof index === 'number' ? index : prev.length;

      // Calculate how many items before targetIndex were removed from prev
      let removedBeforeTarget = 0;
      for (let i = 0; i < Math.min(rawTargetIndex, prev.length); i++) {
        if (dropIdSet.has(prev[i].id)) {
          removedBeforeTarget++;
        }
      }

      const remaining = prev.filter((item) => !dropIdSet.has(item.id));
      const adjustedTargetIndex = Math.max(0, Math.min(rawTargetIndex - removedBeforeTarget, remaining.length));

      const next = [...remaining];
      next.splice(adjustedTargetIndex, 0, ...objectsToDrop);
      return next;
    });
    setSelectedIncidentIds([]);
  };

  const handleAddAll = (ids: string[]) => {
    setDroppedIncidents((prev) => {
      const newItems = [...prev];
      ids.forEach((id) => {
        if (!newItems.some((item) => item.id === id)) {
          const incident = millerIncidents.find((inc) => inc.id === id);
          if (incident) newItems.push(incident);
        }
      });
      return newItems;
    });
  };

  const handleRemoveIncident = (incidentId: string) => {
    setDroppedIncidents((prev) => prev.filter((item) => item.id !== incidentId));
  };

  const handleClearCanvas = () => {
    setDroppedIncidents([]);
  };

  const { companyName, selectedMillerSites, user } = useDashboard();
  const selectedSiteName = selectedMillerSites.length === 1
    ? selectedMillerSites[0]
    : selectedMillerSites.length > 1
      ? `${selectedMillerSites.length} Sites Selected`
      : "No Site Selected";
  const userName = user?.displayName || user?.email || "Inspector";

  const generateReportSummary = (incidents: any[]): string => {
    // TODo : Generate Summary using AI 
    return incidents
      .map((inc) => inc.summary)
      .filter(Boolean)
      .join("\n\n");
  };

  const getActiveReportFromIndexedDB = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("InspectaReportsDB", 1);
      request.onsuccess = (event: any) => {
        const db = event.target.result;
        try {
          if (!db.objectStoreNames.contains("reports")) {
            resolve(null);
            return;
          }
          const transaction = db.transaction("reports", "readonly");
          const store = transaction.objectStore("reports");
          const getReq = store.get("active_report");
          getReq.onsuccess = () => {
            resolve(getReq.result?.data || null);
          };
          getReq.onerror = () => {
            reject(new Error("Failed to get report from store"));
          };
        } catch (err) {
          reject(err);
        }
      };
      request.onerror = (event: any) => {
        reject(new Error("Failed to open IndexedDB"));
      };
    });
  };

  const handleGenerateReport = (summaryText: string) => {
    const generatedSummary = generateReportSummary(droppedIncidents);
    const reportData = {
      date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      companyName: companyName || "Inspecta Inc.",
      selectedSiteName,
      summary: generatedSummary && generatedSummary.trim() !== "" ? generatedSummary : summaryText,
      incidents: droppedIncidents.map((inc) => ({
        id: inc.id,
        summary: inc.summary,
        created: inc.created
      })),
      userName,
      generatedAt: new Date().toISOString()
    };

    const request = indexedDB.open("InspectaReportsDB", 1);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("reports")) {
        db.createObjectStore("reports", { keyPath: "id" });
      }
    };

    request.onsuccess = (event: any) => {
      const db = event.target.result;
      const transaction = db.transaction("reports", "readwrite");
      const store = transaction.objectStore("reports");

      // Store using a static key so only one report exists at any point in time
      const record = {
        id: "active_report",
        data: reportData
      };

      const putRequest = store.put(record);
      putRequest.onsuccess = () => {
        alert("Report generated successfully!");
      };
      putRequest.onerror = (err: any) => {
        console.error("Failed to store report in IndexedDB:", err);
      };
    };

    request.onerror = (event: any) => {
      console.error("IndexedDB error:", event);
    };
  };

  const handleExportReport = async () => {
    try {
      // 1. Try to fetch the active report JSON from IndexedDB
      let reportData: any = null;
      try {
        reportData = await getActiveReportFromIndexedDB();
      } catch (e) {
        console.warn("Could not read from IndexedDB, generating PDF from current state...", e);
      }

      // Fallback to active state if IndexedDB was empty or failed
      if (!reportData) {
        const generatedSummary = generateReportSummary(droppedIncidents);
        reportData = {
          date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
          companyName: companyName || "Inspecta Inc.",
          selectedSiteName,
          summary: generatedSummary,
          incidents: droppedIncidents.map((inc) => ({
            id: inc.id,
            summary: inc.summary,
            created: inc.created
          })),
          userName,
          generatedAt: new Date().toISOString()
        };
      }

      // 2. Generate PDF from the JSON object using jsPDF
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();

      // Page styling / Header
      doc.setFillColor(30, 41, 59); // Dark slate header
      doc.rect(0, 0, 210, 22, "F"); // Reduced height from 35 to 22

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(`DPR : ${reportData.selectedSiteName}`, 15, 14);

      // Company name in the header, top right corner
      doc.setFontSize(11);
      doc.text(reportData.companyName, 195, 14, { align: "right" });

      // Metadata section (Y coordinates shifted up and Company removed)
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(11);

      doc.setFont("helvetica", "bold");
      doc.text("Site:", 15, 35);
      doc.setFont("helvetica", "normal");
      doc.text(reportData.selectedSiteName, 45, 35);

      doc.setFont("helvetica", "bold");
      doc.text("Inspector:", 15, 42);
      doc.setFont("helvetica", "normal");
      doc.text(reportData.userName, 45, 42);

      doc.setFont("helvetica", "bold");
      doc.text("Report Date:", 15, 49);
      doc.setFont("helvetica", "normal");
      doc.text(reportData.date, 45, 49);

      // Divider line
      doc.setDrawColor(226, 232, 240);
      doc.line(15, 56, 195, 56);

      // Summary section
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("EXECUTIVE SUMMARY", 15, 66);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const splitSummary = doc.splitTextToSize(reportData.summary || "No summary provided.", 180);
      doc.text(splitSummary, 15, 74);

      // Calculate Y position after summary
      let currentY = 74 + (splitSummary.length * 5) + 10;

      // Divider line
      doc.line(15, currentY, 195, currentY);
      currentY += 10;

      // Incidents list
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("COMPILED INCIDENTS & OBSERVATIONS", 15, currentY);
      currentY += 8;

      doc.setFontSize(10);
      if (reportData.incidents && reportData.incidents.length > 0) {
        reportData.incidents.forEach((inc: any) => {
          // Check page overflow
          if (currentY > 270) {
            doc.addPage();
            currentY = 20;
          }

          doc.setFont("helvetica", "normal");
          const splitIncSummary = doc.splitTextToSize(inc.summary || "No summary", 180);
          doc.text(splitIncSummary, 15, currentY);
          currentY += (splitIncSummary.length * 5) + 6;
        });
      } else {
        doc.setFont("helvetica", "normal");
        doc.text("No incidents selected in this report.", 15, currentY);
      }

      // 3. Download the PDF
      doc.save(`DPR_${reportData.companyName.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      alert("Failed to export PDF report.");
    }
  };

  return (
    <div className={`h-full flex flex-col p-4 overflow-hidden ${theme.background.section}`}>
      {/* Report Builder Pane - Matches IncidentSelectionPane look and feel, takes full height */}
      <div className="bg-white border border-slate-200/70 rounded-xl overflow-hidden shadow-md w-full flex-1 flex flex-col">
        {/* Pane Header */}
        <div
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center justify-between px-4 py-3 bg-slate-100 border-b border-slate-200/70 cursor-pointer select-none hover:bg-slate-200/50 transition-colors shrink-0"
        >
          <div className="flex items-center gap-2 text-[15px] font-bold text-slate-700">
            <BarChart2 className="w-5 h-5 text-blue-600 mr-1" />
            <span>Building Daily Progress Report (DPR)</span>
            {droppedIncidents.length > 0 && (
              <span className="ml-2 text-xs bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full">
                {droppedIncidents.length} Selected
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(!isCollapsed);
            }}
            className={`text-white transition-all p-1 rounded-lg border ${theme.cardBorder} bg-gradient-to-r ${theme.primary.from} ${theme.primary.to}`}
          >
            <ChevronDown className={`w-3.5 h-3.5 transform transition-transform ${isCollapsed ? "" : "rotate-180"}`} />
          </button>
        </div>

        {/* Pane Body */}
        {!isCollapsed && (
          <div className="p-3 bg-slate-50/50 flex-1 flex flex-col min-h-0">
            <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-slate-200 border border-blue-200/50 rounded-xl flex-1 overflow-hidden bg-gradient-to-br from-slate-50 to-blue-50/70 shadow-sm min-h-0">

              {/* ReportingIncidents (Left side, far narrower than canvas on desktop) */}
              <div className="w-full lg:w-[360px] shrink-0 min-w-0 flex flex-col h-[300px] lg:h-full">
                <ReportingIncidents
                  incidents={displayedIncidents}
                  selectedIncidentIds={selectedIncidentIds}
                  droppedIncidentIds={droppedIncidents.map((i) => i.id)}
                  onToggleSelect={(id) => {
                    setSelectedIncidentIds((prev) =>
                      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
                    );
                  }}
                  onDragStart={handleDragStart}
                  onAddAll={handleAddAll}
                  onRefresh={() => setSelectedMillerIncidents(millerIncidents.map(i => i.id))}
                />
              </div>

              {/* ReportingCanvas (Right side, takes up the remaining width) */}
              <div className="flex-1 min-w-0 flex flex-col h-[350px] lg:h-full">
                <ReportingCanvas
                  droppedIncidents={droppedIncidents}
                  onDrop={handleDrop}
                  onClear={handleClearCanvas}
                  onRemoveIncident={handleRemoveIncident}
                  companyName={companyName || "Inspecta Inc."}
                  selectedSiteName={selectedSiteName}
                  userName={userName}
                  onGenerateReport={handleGenerateReport}
                  onExportReport={handleExportReport}
                />
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
