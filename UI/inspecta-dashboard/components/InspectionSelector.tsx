import React, { useState, useRef, useEffect } from "react";
import { Plus, AlertCircle, ChevronDown } from "lucide-react";

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
  const [isSiteDropdownOpen, setIsSiteDropdownOpen] = useState(false);
  const [isInspectionDropdownOpen, setIsInspectionDropdownOpen] = useState(false);

  const siteRef = useRef<HTMLDivElement>(null);
  const inspectionRef = useRef<HTMLDivElement>(null);

  // Click outside detection to close dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (siteRef.current && !siteRef.current.contains(event.target as Node)) {
        setIsSiteDropdownOpen(false);
      }
      if (inspectionRef.current && !inspectionRef.current.contains(event.target as Node)) {
        setIsInspectionDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedSite = backendSites.find(s => String(s.site_id || s.id) === selectedSiteId);
  const selectedSiteName = selectedSite ? (selectedSite.site_name || selectedSite.name) : "Select Site...";

  const selectedInspection = filteredInspections.find(ins => String(ins.inspection_id) === selectedInspectionId);
  let selectedInspectionLabel = "Select Inspection...";
  if (isSiteDisabled) {
    selectedInspectionLabel = "Select a site first...";
  } else if (filteredInspections.length === 0) {
    selectedInspectionLabel = "No Inspections Available under Site";
  } else if (selectedInspection) {
    const dateStr = formatDate(selectedInspection.inspection_created_at);
    selectedInspectionLabel = dateStr ? `${selectedInspection.label} (${dateStr})` : selectedInspection.label;
  }

  // Exact styles matching native select, but holding 2 lines and height h-13
  const triggerStyle = "w-full bg-white border border-slate-200 rounded-lg flex flex-col justify-center items-start px-3 text-left transition-all cursor-pointer h-13 relative focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm";

  return (
    <>
      {/* Site Selector Custom Dropdown */}
      <div className="flex flex-col gap-2.0 w-full max-w-[485px]" ref={siteRef}>
        <div className="relative w-full">
          <button
            type="button"
            onClick={() => setIsSiteDropdownOpen(!isSiteDropdownOpen)}
            className={`${triggerStyle} ${isSiteDropdownOpen ? "border-blue-500 ring-1 ring-blue-500" : ""}`}
          >
            <span className="text-[9px] font-bold text-blue-500 uppercase tracking-wider select-none leading-none mb-1.5">
              Site for Incident
            </span>
            <span className="text-xs font-semibold text-slate-800 truncate pr-6 leading-normal">
              🏢  {selectedSiteName}
            </span>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          </button>

          {isSiteDropdownOpen && (
            <div className="absolute top-[105%] left-0 z-30 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto py-1 mt-1 animate-fadeIn">
              {backendSites.length === 0 ? (
                <div className="px-4 py-2.5 text-xs text-slate-400 italic">No Sites Available</div>
              ) : (
                backendSites.map((site) => {
                  const id = String(site.site_id || site.id);
                  const name = site.site_name || site.name;
                  const isSelected = id === selectedSiteId;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setSelectedSiteId(id);
                        setIsSiteDropdownOpen(false);
                      }}
                      className={`w-full px-4 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 ${isSelected ? "bg-blue-50/50 text-blue-600 font-bold" : ""}`}
                    >
                      🏢  {name}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Inspection Selector Custom Dropdown */}
      <div className="flex flex-col gap-3 w-full max-w-[485px]" ref={inspectionRef}>
        <div className="relative w-full">
          <button
            type="button"
            disabled={isSiteDisabled}
            onClick={() => setIsInspectionDropdownOpen(!isInspectionDropdownOpen)}
            className={`${triggerStyle} ${isInspectionDropdownOpen ? "border-blue-500 ring-1 ring-blue-500" : ""} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <span className="text-[9px] font-semibold text-blue-500 uppercase tracking-wider select-none leading-none mb-1.5">
              Inspection for Incident
            </span>
            <span className="text-xs font-semibold text-slate-800 truncate pr-6 leading-normal">
              🔍  {selectedInspectionLabel}
            </span>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          </button>

          {isInspectionDropdownOpen && !isSiteDisabled && (
            <div className="absolute top-[105%] left-0 z-30 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto py-1 mt-1 animate-fadeIn">
              {filteredInspections.length === 0 ? (
                <div className="px-4 py-2.5 text-xs text-slate-400 italic">No Inspections Available under Site</div>
              ) : (
                filteredInspections.map((ins) => {
                  const dateStr = formatDate(ins.inspection_created_at);
                  const displayLabel = dateStr ? `${ins.label} (${dateStr})` : ins.label;
                  const isSelected = String(ins.inspection_id) === selectedInspectionId;
                  return (
                    <button
                      key={ins.inspection_id}
                      type="button"
                      onClick={() => {
                        setSelectedInspectionId(String(ins.inspection_id));
                        setIsInspectionDropdownOpen(false);
                      }}
                      className={`w-full px-4 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 ${isSelected ? "bg-blue-50/50 text-blue-600 font-bold" : ""}`}
                    >
                      🔍  {displayLabel}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Inline Action Trigger */}
        <div className="flex flex-col gap-2 mt-0.5">
          {!isAddingInspectionInline ? (
            <button
              type="button"
              disabled={isSiteDisabled}
              onClick={() => setIsAddingInspectionInline(true)}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-2 self-start transition-colors px-1 py-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-5 h-5 text-blue-600" />
              <span>Create New Inspection</span>
            </button>
          ) : (
            <form onSubmit={handleCreateInspection} className="flex flex-col gap-3.5 bg-slate-50 p-4 rounded-lg border border-slate-200/80 animate-fadeIn">
              <span className="text-[10px] text-slate-600 font-bold uppercase">Adding New Inspection</span>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-500 font-bold">Inspection Title</label>
                <input
                  type="text"
                  placeholder="e.g. Safety Audit - Boiler Room"
                  value={newInspectionTitle}
                  onChange={(e) => setNewInspectionTitle(e.target.value)}
                  className="text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-500 font-bold">Description (Optional)</label>
                <textarea
                  placeholder="Add an optional description about this audit..."
                  value={newInspectionDescription}
                  rows={2}
                  onChange={(e) => setNewInspectionDescription(e.target.value)}
                  className="text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div className="flex gap-2.5 justify-end">
                <button
                  type="button"
                  onClick={() => setIsAddingInspectionInline(false)}
                  className="px-3.5 py-2 bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold hover:bg-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingInspection || !newInspectionTitle.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-[10px] font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isCreatingInspection ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          )}

          {inspectionError && (
            <p className="text-[10px] text-rose-500 bg-rose-50 border border-rose-100 rounded-lg px-3 py-1.5 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{inspectionError}</span>
            </p>
          )}
        </div>
      </div>
    </>
  );
}
