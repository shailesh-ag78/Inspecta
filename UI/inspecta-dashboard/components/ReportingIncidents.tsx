import React from "react";
import { Plus } from "lucide-react";

interface Incident {
  id: string;
  created?: string;
}

interface ReportingIncidentsProps {
  incidents: Incident[];
  selectedIncidentIds: string[];
  onToggleSelect: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onAddAll: (ids: string[]) => void;
}

export function ReportingIncidents({
  incidents,
  selectedIncidentIds,
  onToggleSelect,
  onDragStart,
  onAddAll
}: ReportingIncidentsProps) {

  // Sort in descending order of their date and time
  const sortedIncidents = React.useMemo(() => {
    return [...incidents].sort((a, b) => {
      const timeA = a.created ? new Date(a.created).getTime() : 0;
      const timeB = b.created ? new Date(b.created).getTime() : 0;
      return timeB - timeA;
    });
  }, [incidents]);

  return (
    <div className="flex-1 h-full overflow-y-auto p-3.5 space-y-2 scrollbar-thin">
      <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
        <h5 className="text-xs font-black text-amber-800 uppercase tracking-widest flex items-center gap-1.5">
          <i className="fa-solid fa-list-check text-slate-500" />
          Incidents ({sortedIncidents.length})
        </h5>
        {sortedIncidents.length > 0 && (
          <button
            type="button"
            onClick={() => onAddAll(sortedIncidents.map(i => i.id))}
            className="text-[10px] font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-3 py-0.5 rounded-full transition-colors flex items-center gap-0.5 shadow-sm cursor-pointer"
          >
            <Plus className="w-2.5 h-2.5" />
            Add All
          </button>
        )}
      </div>

      {sortedIncidents.length === 0 ? (
        <div className="text-sm text-slate-450 italic px-2 py-4 text-center">
          No incidents.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {sortedIncidents.map((incident) => {
            const label = `${incident.id.slice(0, 4)}XXX`;

            const createdDate = incident.created ? new Date(incident.created) : null;
            const dateStr = createdDate ? createdDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'N/A';
            const timeStr = createdDate ? createdDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'N/A';
            const isSelected = selectedIncidentIds.includes(incident.id);

            return (
              <div
                key={incident.id}
                draggable
                onDragStart={(e) => onDragStart(e, incident.id)}
                onClick={() => onToggleSelect(incident.id)}
                className={`relative w-full h-[88px] border rounded-lg flex flex-col items-center justify-center shadow-sm cursor-grab active:cursor-grabbing transition-all select-none group text-center px-1 ${isSelected
                  ? "bg-gradient-to-br from-orange-100 to-orange-200 border-orange-400 ring-2 ring-orange-300"
                  : "bg-gradient-to-br from-orange-50 to-orange-100/60 border-orange-200/80 hover:border-orange-350"
                  }`}
                id={label}
              >
                {/* Match IncidentSelectionPane format (Row 1) */}
                <span className="text-[11px] font-black text-orange-900 tracking-wider truncate w-full px-1 group-hover:text-blue-600 transition-colors">
                  {label}
                </span>

                {/* Greyed out Date (Row 2) */}
                <span className="text-[11px] font-medium text-slate-900 mt-1">
                  {dateStr}
                </span>

                {/* Greyed out Time (Row 3) */}
                <span className="text-[11px] font-medium text-slate-900 mt-1">
                  {timeStr}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
