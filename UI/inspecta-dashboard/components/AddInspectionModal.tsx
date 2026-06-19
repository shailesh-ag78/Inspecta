"use client";

import { useState, useEffect } from 'react';
import { Plus, List } from 'lucide-react';

interface Site {
  id: string;
  name: string;
  address?: string;
}

interface AddInspectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  sites: Site[];
  onSubmit: (data: {
    siteId: string | null;
    newSiteName?: string;
    newSiteAddress?: string;
    friendlyName?: string;
  }) => void;
}

export default function AddInspectionModal({ isOpen, onClose, sites, onSubmit }: AddInspectionModalProps) {
  const [isNewSite, setIsNewSite] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteAddress, setNewSiteAddress] = useState('');
  const [friendlyName, setFriendlyName] = useState('');

  // Reset inputs when opened/closed
  useEffect(() => {
    if (isOpen) {
      setIsNewSite(false);
      setSelectedSiteId('');
      setNewSiteName('');
      setNewSiteAddress('');
      setFriendlyName('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isNewSite) {
      if (newSiteName.trim() && newSiteAddress.trim()) {
        onSubmit({
          siteId: null,
          newSiteName: newSiteName.trim(),
          newSiteAddress: newSiteAddress.trim(),
          friendlyName: friendlyName.trim() || undefined,
        });
      }
    } else {
      if (selectedSiteId) {
        onSubmit({
          siteId: selectedSiteId,
          friendlyName: friendlyName.trim() || undefined,
        });
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-900/95 border border-slate-700/60 rounded-3xl p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
        <h3 className="text-lg font-bold text-white mb-2">Add an inspection to the site</h3>
        <p className="text-xs text-slate-400 mb-6">Specify the site and friendly details for the new inspection.</p>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Friendly Name Input (Moved above Choose Site) */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-300 min-w-[110px]">Friendly Name</span>
            <input
              type="text"
              placeholder="Friendly Name for the inspection (optional)"
              value={friendlyName}
              onChange={(e) => setFriendlyName(e.target.value)}
              className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Choose Site Dropdown */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-300 min-w-[110px]">Choose Site</span>
            <select
              disabled={isNewSite}
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              required={!isNewSite}
            >
              <option value="">Select an existing site...</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setIsNewSite(!isNewSite)}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border transition-all text-xs font-bold whitespace-nowrap cursor-pointer ${isNewSite
                ? 'bg-orange-600/20 border-orange-500/50 text-orange-400 hover:bg-orange-600/30'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                }`}
            >
              {isNewSite ? (
                <>
                  <List className="w-3.5 h-3.5" />
                  Use Existing Site
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  New site
                </>
              )}
            </button>
          </div>

          {/* New Site Details Form (Always visible, enabled only if isNewSite is toggled, indented) */}
          <div className="space-y-4 pl-8 transition-all duration-200">
            <div className="flex items-center gap-3">
              <span className={`text-sm font-semibold min-w-[94px] transition-all ${isNewSite ? 'text-slate-300' : 'text-slate-600'}`}>Site Name</span>
              <input
                type="text"
                placeholder="Enter new site name"
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value)}
                disabled={!isNewSite}
                className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                required={isNewSite}
              />
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-semibold min-w-[94px] transition-all ${isNewSite ? 'text-slate-300' : 'text-slate-600'}`}>Site Address</span>
              <input
                type="text"
                placeholder="Enter site address"
                value={newSiteAddress}
                onChange={(e) => setNewSiteAddress(e.target.value)}
                disabled={!isNewSite}
                className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                required={isNewSite}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-lg"
            >
              Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
