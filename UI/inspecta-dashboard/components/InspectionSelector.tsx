import React from "react";
import { Plus, AlertCircle } from "lucide-react";

interface InspectionSelectorProps {
  backendSites: any[];
  selectedSiteId: string;
  setSelectedSiteId: (val: string) => void;
  filteredInspections: any[];
  selectedInspectionId: string;
  setSelectedInspectionId: (val: string) => void;
  isSiteDisabled: boolean;
  isAddingInspectionInline: boolean;
  setIsAddingInspectionInline: (val: boolean) => void;
  newInspectionTitle: string;
  setNewInspectionTitle: (val: string) => void;
  newInspectionDescription: string;
  setNewInspectionDescription: (val: string) => void;
  isCreatingInspection: boolean;
  handleCreateInspection: (e: React.FormEvent) => void;
  inspectionError: string | null;
  formatDate: (isoString?: string) => string;
}

export function InspectionSelector({
  backendSites,
  selectedSiteId,
  setSelectedSiteId,
  filteredInspections,
  selectedInspectionId,
  setSelectedInspectionId,
  isSiteDisabled,
  isAddingInspectionInline,
  setIsAddingInspectionInline,
  newInspectionTitle,
  setNewInspectionTitle,
  newInspectionDescription,
  setNewInspectionDescription,
  isCreatingInspection,
  handleCreateInspection,
  inspectionError,
  formatDate
}: InspectionSelectorProps) {
  const labelHeaderStyle = "text-base font-bold text-slate-700 tracking-wide";

  return (
    <>
      {/* Site Selector (Bounded/fixed width) */}
      <div className="flex flex-col gap-2 w-full max-w-[485px]">
        <label className={labelHeaderStyle}>
          Site for Incident
        </label>
        <select
          value={selectedSiteId}
          onChange={(e) => setSelectedSiteId(e.target.value)}
          className="w-full text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500 transition-all cursor-pointer h-11"
        >
          {backendSites.length === 0 ? (
            <option value="">No Sites Available</option>
          ) : (
            backendSites.map((site) => (
              <option key={site.site_id || site.id} value={site.site_id || site.id} className="text-sm">
                🏢  {site.site_name || site.name}
              </option>
            ))
          )}
        </select>
      </div>

      {/* Inspection Selector & Inline Action (Bounded/fixed width) with increased gap */}
      <div className="flex flex-col gap-3 w-full max-w-[485px]">
        <div className="flex flex-col gap-2">
          <label className={labelHeaderStyle}>Inspection for Incident</label>
          <select
            value={selectedInspectionId}
            disabled={isSiteDisabled}
            onChange={(e) => setSelectedInspectionId(e.target.value)}
            className="w-full text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-3 focus:outline-none focus:border-blue-500 transition-all cursor-pointer h-11 disabled:opacity-50"
          >
            {filteredInspections.length === 0 ? (
              <option value="">No Inspections Available under Site</option>
            ) : (
              filteredInspections.map((ins) => {
                const dateStr = formatDate(ins.inspection_created_at);
                const displayLabel = dateStr ? `${ins.label} (${dateStr})` : ins.label;
                return (
                  <option key={ins.inspection_id} value={ins.inspection_id || ""} className="text-sm">
                    🔍  {displayLabel}
                  </option>
                );
              })
            )}
          </select>
        </div>

        {/* Inline Action Trigger */}
        <div className="flex flex-col gap-2 mt-0.5">
          {!isAddingInspectionInline ? (
            <button
              type="button"
              disabled={isSiteDisabled}
              onClick={() => setIsAddingInspectionInline(true)}
              className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-2 self-start transition-colors px-1 py-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-5 h-5 text-blue-600" />
              <span>Create New Inspection</span>
            </button>
          ) : (
            <form onSubmit={handleCreateInspection} className="flex flex-col gap-3.5 bg-slate-50 p-4 rounded-lg border border-slate-200/80 animate-fadeIn">
              <span className="text-xs text-slate-600 font-bold uppercase">Adding New Inspection</span>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-slate-500 font-bold">Inspection Title</label>
                <input
                  type="text"
                  placeholder="e.g. Safety Audit - Boiler Room"
                  value={newInspectionTitle}
                  onChange={(e) => setNewInspectionTitle(e.target.value)}
                  className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-slate-500 font-bold">Description (Optional)</label>
                <textarea
                  placeholder="Add an optional description about this audit..."
                  value={newInspectionDescription}
                  rows={2}
                  onChange={(e) => setNewInspectionDescription(e.target.value)}
                  className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div className="flex gap-2.5 justify-end">
                <button
                  type="button"
                  onClick={() => setIsAddingInspectionInline(false)}
                  className="px-3.5 py-2 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingInspection || !newInspectionTitle.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isCreatingInspection ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          )}

          {inspectionError && (
            <p className="text-xs text-rose-500 bg-rose-50 border border-rose-100 rounded-lg px-3 py-1.5 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{inspectionError}</span>
            </p>
          )}
        </div>
      </div>
    </>
  );
}
