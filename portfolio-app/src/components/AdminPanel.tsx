// AdminPanel.tsx
// Dedicated dashboard panel for administrators to manage user accounts, EOD quotes, and EOD syncs.

'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  adminGetUsers, 
  adminUpdateUser, 
  DBUser,
  adminGetQuotes,
  adminAddQuote,
  adminUpdateQuote,
  adminDeleteQuote,
  adminDeleteUser,
  adminMassDeleteUsers,
  adminMassDeleteQuotes,
  DBQuote
} from '../utils/dbClient';
import { 
  Users, 
  Shield, 
  ShieldAlert, 
  Lock, 
  Unlock, 
  ArrowLeft, 
  Search, 
  RefreshCw, 
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Globe,
  Coins,
  DollarSign
} from 'lucide-react';

interface AdminPanelProps {
  onBack: () => void;
}

export default function AdminPanel({ onBack }: AdminPanelProps) {
  const { user } = useAuth();
  
  // Tab State
  const [activeTab, setActiveTab] = useState<'users' | 'quotes'>('users');

  // Notifications State
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Selected IDs for mass deletion
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedQuoteIds, setSelectedQuoteIds] = useState<string[]>([]);

  // ----------------------------------------------------
  // Tab 1: User Accounts States & Logic
  // ----------------------------------------------------
  const [users, setUsers] = useState<DBUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userSearch, setUserSearch] = useState('');
  const [actioningUserId, setActioningUserId] = useState<string | null>(null);

  const handleDeleteUser = async (targetUser: DBUser) => {
    if (targetUser.id === user?.id) {
      setError('Failsafe: You cannot delete your own account.');
      return;
    }
    if (!confirm(`Are you sure you want to permanently delete user account ${targetUser.email}? This cannot be undone.`)) return;
    try {
      setActioningUserId(targetUser.id);
      setError(null);
      setSuccess(null);
      await adminDeleteUser(targetUser.id);
      setUsers(prev => prev.filter(u => u.id !== targetUser.id));
      setSelectedUserIds(prev => prev.filter(id => id !== targetUser.id));
      setSuccess(`Successfully deleted user account ${targetUser.email}.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to delete user.');
    } finally {
      setActioningUserId(null);
    }
  };

  const handleMassDeleteUsers = async () => {
    const idsToDelete = selectedUserIds.filter(id => id !== user?.id);
    if (idsToDelete.length === 0) return;
    if (!confirm(`Are you sure you want to permanently delete ${idsToDelete.length} selected user accounts? This will delete all their portfolios and assets.`)) return;
    try {
      setError(null);
      setSuccess(null);
      await adminMassDeleteUsers(idsToDelete);
      setUsers(prev => prev.filter(u => !idsToDelete.includes(u.id)));
      setSelectedUserIds([]);
      setSuccess(`Successfully deleted ${idsToDelete.length} user accounts.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to mass delete users.');
    }
  };

  const handleSelectAllUsers = (checked: boolean) => {
    if (checked) {
      const selectableIds = filteredUsers.filter(u => u.id !== user?.id).map(u => u.id);
      setSelectedUserIds(selectableIds);
    } else {
      setSelectedUserIds([]);
    }
  };

  const handleSelectUser = (userId: string, checked: boolean) => {
    if (checked) {
      setSelectedUserIds(prev => [...prev, userId]);
    } else {
      setSelectedUserIds(prev => prev.filter(id => id !== userId));
    }
  };

  const handleMassDeleteQuotes = async () => {
    if (selectedQuoteIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete the ${selectedQuoteIds.length} selected EOD quotes?`)) return;
    try {
      setError(null);
      setSuccess(null);
      await adminMassDeleteQuotes({ ids: selectedQuoteIds });
      setQuotes(prev => prev.filter(q => !selectedQuoteIds.includes(q.id)));
      setSelectedQuoteIds([]);
      setSuccess(`Successfully deleted ${selectedQuoteIds.length} EOD quotes.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to mass delete quotes.');
    }
  };

  const handleWipeTickerQuotes = async () => {
    if (!quoteSearch.trim()) return;
    const tickerToWipe = quoteSearch.trim().toUpperCase();
    if (!confirm(`Are you sure you want to delete ALL EOD quotes for ticker "${tickerToWipe}"? This cannot be undone.`)) return;
    try {
      setError(null);
      setSuccess(null);
      setLoadingQuotes(true);
      await adminMassDeleteQuotes({ ticker: tickerToWipe });
      setQuotes(prev => prev.filter(q => q.ticker.toUpperCase() !== tickerToWipe));
      setSelectedQuoteIds(prev => prev.filter(id => {
        const q = quotes.find(item => item.id === id);
        return q ? q.ticker.toUpperCase() !== tickerToWipe : true;
      }));
      setSuccess(`Successfully wiped all EOD quotes for ${tickerToWipe}.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to wipe ticker quotes.');
    } finally {
      setLoadingQuotes(false);
    }
  };

  const handleSelectAllQuotes = (checked: boolean) => {
    if (checked) {
      setSelectedQuoteIds(quotes.map(q => q.id));
    } else {
      setSelectedQuoteIds([]);
    }
  };

  const handleSelectQuote = (quoteId: string, checked: boolean) => {
    if (checked) {
      setSelectedQuoteIds(prev => [...prev, quoteId]);
    } else {
      setSelectedQuoteIds(prev => prev.filter(id => id !== quoteId));
    }
  };

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      setError(null);
      const list = await adminGetUsers();
      setUsers(list);
    } catch (err: any) {
      console.error('Failed to load users:', err);
      setError(err?.message || 'Failed to retrieve users directory.');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleToggleAdmin = async (targetUser: DBUser) => {
    if (targetUser.id === user?.id) {
      setError('Failsafe: You cannot modify your own administrator privileges.');
      return;
    }
    try {
      setActioningUserId(targetUser.id);
      setError(null);
      setSuccess(null);
      const newAdminState = !targetUser.is_admin;
      await adminUpdateUser(targetUser.id, newAdminState, targetUser.is_locked);
      setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, is_admin: newAdminState } : u));
      setSuccess(`Successfully updated ${targetUser.email}'s administrator privilege.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to update administrator status.');
    } finally {
      setActioningUserId(null);
    }
  };

  const handleToggleLock = async (targetUser: DBUser) => {
    if (targetUser.id === user?.id) {
      setError('Failsafe: You cannot lock your own account.');
      return;
    }
    try {
      setActioningUserId(targetUser.id);
      setError(null);
      setSuccess(null);
      const newLockedState = !targetUser.is_locked;
      await adminUpdateUser(targetUser.id, targetUser.is_admin, newLockedState);
      setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, is_locked: newLockedState } : u));
      setSuccess(`Successfully ${newLockedState ? 'locked' : 'unlocked'} user ${targetUser.email}.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to update user lock status.');
    } finally {
      setActioningUserId(null);
    }
  };

  // ----------------------------------------------------
  // Tab 2: EOD Quotes States & Logic
  // ----------------------------------------------------
  const [quotes, setQuotes] = useState<DBQuote[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [quoteSearch, setQuoteSearch] = useState('');
  
  // Add Quote Form State
  const [addTicker, setAddTicker] = useState('');
  const [addDate, setAddDate] = useState('');
  const [addPrice, setAddPrice] = useState('');
  const [addVolume, setAddVolume] = useState('');
  const [addingQuote, setAddingQuote] = useState(false);

  // Edit Quote State
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editVolume, setEditVolume] = useState('');
  const [updatingQuoteId, setUpdatingQuoteId] = useState<string | null>(null);

  // Sync Form State
  const [syncTicker, setSyncTicker] = useState('');
  const [syncStartDate, setSyncStartDate] = useState('2024-01-01');
  const [syncingTicker, setSyncingTicker] = useState<string | null>(null);

  // Predefined Popular Ticker Directory
  const popularAssets = [
    { ticker: 'SPY', name: 'S&P 500 Index', type: 'etf' },
    { ticker: 'QQQ', name: 'Nasdaq 100 Index', type: 'etf' },
    { ticker: 'TLT', name: '20+ Year Treasury', type: 'etf' },
    { ticker: 'GLD', name: 'Gold Shares', type: 'metal' },
    { ticker: 'SLV', name: 'Silver Shares', type: 'metal' },
    { ticker: 'UUP', name: 'US Dollar Index', type: 'currency' },
    { ticker: 'FXE', name: 'Euro Currency Shares', type: 'currency' },
    { ticker: 'FXY', name: 'Yen Currency Shares', type: 'currency' },
  ];

  const fetchQuotes = async (tickerQuery?: string) => {
    try {
      setLoadingQuotes(true);
      setError(null);
      const list = await adminGetQuotes(tickerQuery);
      setQuotes(list);
    } catch (err: any) {
      console.error('Failed to load quotes:', err);
      setError(err?.message || 'Failed to retrieve EOD quotes from table.');
    } finally {
      setLoadingQuotes(false);
    }
  };

  const handleAddQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addTicker.trim() || !addDate || !addPrice) return;
    try {
      setAddingQuote(true);
      setError(null);
      setSuccess(null);
      const newQuote = await adminAddQuote({
        ticker: addTicker.trim().toUpperCase(),
        date: addDate,
        adj_close: parseFloat(addPrice),
        volume: addVolume ? parseInt(addVolume) : null
      });
      setQuotes(prev => [newQuote, ...prev]);
      setSuccess(`Added quote for ${newQuote.ticker} on ${newQuote.date} successfully.`);
      
      // Clear inputs
      setAddTicker('');
      setAddDate('');
      setAddPrice('');
      setAddVolume('');
    } catch (err: any) {
      setError(err?.message || 'Failed to add custom EOD quote.');
    } finally {
      setAddingQuote(false);
    }
  };

  const handleStartEditQuote = (q: DBQuote) => {
    setEditingQuoteId(q.id);
    setEditPrice(q.adj_close.toString());
    setEditVolume(q.volume ? q.volume.toString() : '');
  };

  const handleSaveEditQuote = async (q: DBQuote) => {
    if (!editPrice.trim()) return;
    try {
      setUpdatingQuoteId(q.id);
      setError(null);
      setSuccess(null);
      const updated = await adminUpdateQuote(q.id, {
        adj_close: parseFloat(editPrice),
        volume: editVolume ? parseInt(editVolume) : null
      });
      setQuotes(prev => prev.map(item => item.id === q.id ? updated : item));
      setEditingQuoteId(null);
      setSuccess(`Updated quote for ${q.ticker} on ${q.date}.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to update quote price.');
    } finally {
      setUpdatingQuoteId(null);
    }
  };

  const handleDeleteQuote = async (q: DBQuote) => {
    if (!confirm(`Are you sure you want to delete EOD quote for ${q.ticker} on ${q.date}?`)) return;
    try {
      setError(null);
      setSuccess(null);
      await adminDeleteQuote(q.id);
      setQuotes(prev => prev.filter(item => item.id !== q.id));
      setSuccess(`Deleted quote for ${q.ticker} on ${q.date}.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to delete EOD quote.');
    }
  };

  const handleSyncFromYahoo = async (tickerToSync: string, startStr: string) => {
    if (!tickerToSync.trim()) return;
    const tickerClean = tickerToSync.trim().toUpperCase();
    try {
      setSyncingTicker(tickerClean);
      setError(null);
      setSuccess(null);
      
      const res = await fetch(`/api/cron/sync?ticker=${encodeURIComponent(tickerClean)}&startDate=${startStr}`, {
        method: 'POST'
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Sync request failed.');
      
      setSuccess(`Yahoo Sync: Imported ${data.processed || 0} quotes for ${tickerClean}.`);
      await fetchQuotes(quoteSearch || undefined);
    } catch (err: any) {
      setError(`Failed to sync from Yahoo Finance: ${err.message}`);
    } finally {
      setSyncingTicker(null);
    }
  };

  // Load appropriate data on tab change
  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers();
    } else {
      fetchQuotes();
    }
  }, [activeTab]);

  // Filters
  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.id.toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-950 text-white font-sans">
      {/* Top Header */}
      <div className="flex items-center justify-between p-6 border-b border-white/10 bg-slate-900/40 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-900 border border-white/5 hover:bg-slate-800 hover:border-white/10 text-slate-400 hover:text-white transition flex items-center justify-center"
            title="Back to Dashboard"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white font-display">
                Admin Control Panel
              </h1>
              <span className="px-2 py-0.5 text-xxs font-bold uppercase rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                Secure RPC Access
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Manage accounts, assign administrator roles, edit EOD quotes database tables, and trigger Yahoo API updates.
            </p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex bg-slate-900 border border-white/10 rounded-xl p-1 shrink-0">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              activeTab === 'users' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users size={14} />
            User Accounts
          </button>
          <button
            onClick={() => setActiveTab('quotes')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              activeTab === 'quotes' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database size={14} />
            EOD Quotes Table
          </button>
        </div>
      </div>

      {/* Notifications */}
      <div className="px-6 pt-4 space-y-2 shrink-0">
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold mb-0.5">Operation Error</p>
              <p>{error}</p>
            </div>
          </div>
        )}
        
        {success && (
          <div className="flex items-start gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold mb-0.5">Success</p>
              <p>{success}</p>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'users' ? (
          /* ======================================================== */
          /* USER MANAGEMENT VIEW                                     */
          /* ======================================================== */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search Controls */}
            <div className="p-6 pb-2 shrink-0 flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="relative flex-1 w-full">
                <span className="absolute left-3.5 inset-y-0 flex items-center text-slate-500">
                  <Search size={16} />
                </span>
                <input
                  type="text"
                  placeholder="Search users by email or user ID..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full bg-slate-900/60 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 transition"
                />
              </div>
              {selectedUserIds.length > 0 && (
                <button
                  onClick={handleMassDeleteUsers}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition flex items-center gap-2 shadow-lg shrink-0 w-full sm:w-auto justify-center"
                >
                  <Trash2 size={14} />
                  Delete Selected ({selectedUserIds.length})
                </button>
              )}
            </div>

            {/* User Directory Table */}
            <div className="flex-1 overflow-y-auto px-6 pb-6">
              {loadingUsers ? (
                <div className="flex flex-col items-center justify-center h-64 gap-3">
                  <RefreshCw size={24} className="text-indigo-400 animate-spin" />
                  <span className="text-xs font-medium text-slate-400">Loading directory records...</span>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 border border-dashed border-white/10 rounded-2xl p-6 bg-slate-900/20 text-center">
                  <Users size={32} className="text-slate-600 mb-2" />
                  <p className="text-sm font-semibold text-slate-300">No users found</p>
                </div>
              ) : (
                <div className="border border-white/10 rounded-2xl overflow-hidden bg-slate-900/30 backdrop-blur-md">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900/80 border-b border-white/10 text-slate-400 text-xxs font-bold uppercase tracking-wider">
                        <th className="py-3.5 px-4 font-semibold w-10">
                          <input
                            type="checkbox"
                            className="rounded border-white/10 bg-slate-950 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                            checked={
                              filteredUsers.filter(u => u.id !== user?.id).length > 0 &&
                              selectedUserIds.length === filteredUsers.filter(u => u.id !== user?.id).length
                            }
                            onChange={(e) => handleSelectAllUsers(e.target.checked)}
                          />
                        </th>
                        <th className="py-3.5 px-4 font-semibold">User Email</th>
                        <th className="py-3.5 px-4 font-semibold hidden md:table-cell">User ID</th>
                        <th className="py-3.5 px-4 font-semibold">Roles</th>
                        <th className="py-3.5 px-4 font-semibold">Account State</th>
                        <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs">
                      {filteredUsers.map((item) => {
                        const isSelf = item.id === user?.id;
                        const isUserActioning = actioningUserId === item.id;
                        const isChecked = selectedUserIds.includes(item.id);
                        
                        return (
                          <tr 
                            key={item.id} 
                            className={`hover:bg-white/[0.02] transition-colors ${
                              item.is_locked ? 'bg-red-950/5' : ''
                            }`}
                          >
                            <td className="py-4 px-4 w-10">
                              <input
                                type="checkbox"
                                className="rounded border-white/10 bg-slate-950 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                disabled={isSelf}
                                checked={isChecked}
                                onChange={(e) => handleSelectUser(item.id, e.target.checked)}
                              />
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-white truncate max-w-[200px]">
                                  {item.email}
                                </span>
                                {isSelf && (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-white/10 text-slate-400 text-[10px] font-bold">
                                    YOU
                                  </span>
                                )}
                              </div>
                              {item.created_at && (
                                <span className="text-xxs text-slate-500 flex items-center gap-1 mt-0.5">
                                  <Clock size={10} />
                                  Joined: {new Date(item.created_at).toLocaleDateString()}
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-4 font-mono text-[10px] text-slate-500 hidden md:table-cell">
                              {item.id}
                            </td>
                            <td className="py-4 px-4">
                              {item.is_admin ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                                  <Shield size={11} />
                                  Admin
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 border border-white/5 text-slate-400 font-medium">
                                  Standard
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-4">
                              {item.is_locked ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 font-medium">
                                  <ShieldAlert size={11} />
                                  Locked
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                                  Active
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleToggleAdmin(item)}
                                  disabled={isSelf || isUserActioning}
                                  className={`px-3 py-1.5 rounded-lg border text-xxs font-semibold flex items-center gap-1 transition ${
                                    isSelf 
                                      ? 'opacity-40 cursor-not-allowed border-white/5 bg-slate-900 text-slate-500' 
                                      : item.is_admin
                                        ? 'border-red-500/20 hover:border-red-500/35 bg-red-500/5 hover:bg-red-500/10 text-red-400'
                                        : 'border-indigo-500/20 hover:border-indigo-500/35 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-400'
                                  }`}
                                >
                                  <Shield size={12} />
                                  {item.is_admin ? 'Demote' : 'Grant Admin'}
                                </button>
                                <button
                                  onClick={() => handleToggleLock(item)}
                                  disabled={isSelf || isUserActioning}
                                  className={`px-3 py-1.5 rounded-lg border text-xxs font-semibold flex items-center gap-1 transition ${
                                    isSelf 
                                      ? 'opacity-40 cursor-not-allowed border-white/5 bg-slate-900 text-slate-500' 
                                      : item.is_locked
                                        ? 'border-emerald-500/20 hover:border-emerald-500/35 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400'
                                        : 'border-red-500/20 hover:border-red-500/35 bg-red-500/5 hover:bg-red-500/10 text-red-400'
                                  }`}
                                >
                                  {item.is_locked ? <Unlock size={12} /> : <Lock size={12} />}
                                  {item.is_locked ? 'Unlock' : 'Lock'}
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(item)}
                                  disabled={isSelf || isUserActioning}
                                  className="px-3 py-1.5 rounded-lg border border-red-500/20 hover:border-red-500/35 bg-red-500/5 hover:bg-red-500/10 text-red-400 text-xxs font-semibold flex items-center gap-1 transition disabled:opacity-40 disabled:cursor-not-allowed"
                                  title="Delete Account Permanently"
                                >
                                  <Trash2 size={12} />
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ======================================================== */
          /* EOD QUOTES TABLE MANAGER VIEW                            */
          /* ======================================================== */
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden p-6 gap-6">
            
            {/* LEFT SIDEBAR: Yahoo Sync & Popular Tickers */}
            <div className="w-full lg:w-80 flex flex-col gap-6 shrink-0 overflow-y-auto pr-1">
              
              {/* Form 1: Yahoo Finance API Sync */}
              <div className="p-5 bg-slate-900/60 border border-white/5 rounded-2xl space-y-4">
                <div className="flex items-center gap-2 text-indigo-400">
                  <Globe size={18} />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Yahoo Finance Sync
                  </h3>
                </div>
                <p className="text-xxs text-slate-400 leading-normal">
                  Pull historical adjusted close values directly from Yahoo Finance API.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-bold mb-1 block">Ticker Symbol</label>
                    <input
                      type="text"
                      placeholder="e.g. SPY, GLD, EURUSD=X"
                      value={syncTicker}
                      onChange={(e) => setSyncTicker(e.target.value.toUpperCase())}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl py-1.5 px-3 text-xs text-white uppercase placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-bold mb-1 block">Start Date</label>
                    <input
                      type="date"
                      value={syncStartDate}
                      onChange={(e) => setSyncStartDate(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl py-1.5 px-3 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <button
                    onClick={() => handleSyncFromYahoo(syncTicker, syncStartDate)}
                    disabled={syncingTicker !== null || !syncTicker.trim()}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xxs uppercase tracking-wider transition flex items-center justify-center gap-1.5 disabled:opacity-40"
                  >
                    <RefreshCw size={12} className={syncingTicker === syncTicker ? 'animate-spin' : ''} />
                    Sync Yahoo EOD
                  </button>
                </div>
              </div>

              {/* Directory: Predefined Popular Assets */}
              <div className="p-5 bg-slate-900/60 border border-white/5 rounded-2xl space-y-4">
                <div className="flex items-center gap-2 text-indigo-400">
                  <Coins size={18} />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Popular Assets Tickers
                  </h3>
                </div>
                <div className="space-y-1.5">
                  {popularAssets.map((asset) => {
                    const isSyncingThis = syncingTicker === asset.ticker;
                    return (
                      <div 
                        key={asset.ticker} 
                        className="flex items-center justify-between p-2 rounded-xl bg-slate-950/40 border border-white/5 hover:border-white/10 transition text-xxs"
                      >
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-white">{asset.ticker}</span>
                            <span className={`px-1 rounded text-[8px] font-extrabold uppercase ${
                              asset.type === 'metal' 
                                ? 'bg-amber-500/10 text-amber-400' 
                                : asset.type === 'currency'
                                ? 'bg-teal-500/10 text-teal-400'
                                : 'bg-indigo-500/10 text-indigo-400'
                            }`}>
                              {asset.type}
                            </span>
                          </div>
                          <span className="text-slate-500 text-[9px] block truncate max-w-[130px]">{asset.name}</span>
                        </div>
                        <button
                          onClick={() => {
                            setSyncTicker(asset.ticker);
                            handleSyncFromYahoo(asset.ticker, '2024-01-01');
                          }}
                          disabled={syncingTicker !== null}
                          className="px-2 py-1 bg-slate-900 hover:bg-indigo-600 text-slate-400 hover:text-white rounded border border-white/15 transition font-semibold"
                        >
                          {isSyncingThis ? <RefreshCw size={10} className="animate-spin" /> : 'Sync'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* RIGHT COLUMN: Search Filter, Manual CRUD Grid Table, Add Quote Form */}
            <div className="flex-1 flex flex-col overflow-hidden gap-4">
              
              {/* Form 2: Manual Add Quote Row */}
              <form onSubmit={handleAddQuote} className="p-4 bg-slate-900/40 border border-white/5 rounded-2xl flex flex-wrap items-end gap-3.5 shrink-0">
                <div className="flex items-center gap-1.5 text-indigo-400 w-full mb-1">
                  <Plus size={16} />
                  <span className="text-xxs font-bold uppercase tracking-wider text-slate-200">
                    Add Custom EOD Quote Row
                  </span>
                </div>
                
                <div className="flex-1 min-w-[100px]">
                  <label className="text-[9px] text-slate-400 uppercase font-bold block mb-1">Ticker</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SPY"
                    value={addTicker}
                    onChange={(e) => setAddTicker(e.target.value.toUpperCase())}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl py-1.5 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 uppercase"
                  />
                </div>

                <div className="flex-1 min-w-[110px]">
                  <label className="text-[9px] text-slate-400 uppercase font-bold block mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={addDate}
                    onChange={(e) => setAddDate(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl py-1.5 px-3 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex-1 min-w-[90px]">
                  <label className="text-[9px] text-slate-400 uppercase font-bold block mb-1">Adj Close Price</label>
                  <input
                    type="number"
                    step="0.0001"
                    required
                    placeholder="123.45"
                    value={addPrice}
                    onChange={(e) => setAddPrice(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl py-1.5 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex-1 min-w-[100px]">
                  <label className="text-[9px] text-slate-400 uppercase font-bold block mb-1">Volume (Opt.)</label>
                  <input
                    type="number"
                    placeholder="Volume"
                    value={addVolume}
                    onChange={(e) => setAddVolume(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl py-1.5 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={addingQuote}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xxs uppercase tracking-wider transition shrink-0"
                >
                  {addingQuote ? 'Adding...' : 'Add Row'}
                </button>
              </form>

              {/* Search quotes input & Delete Controls */}
              <div className="flex flex-col sm:flex-row items-center gap-2 shrink-0">
                <div className="relative flex-1 w-full">
                  <span className="absolute left-3.5 inset-y-0 flex items-center text-slate-500">
                    <Search size={14} />
                  </span>
                  <input
                    type="text"
                    placeholder="Enter ticker to search (e.g. SPY) and click load..."
                    value={quoteSearch}
                    onChange={(e) => setQuoteSearch(e.target.value.toUpperCase())}
                    className="w-full bg-slate-900/60 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 transition"
                  />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    onClick={() => fetchQuotes(quoteSearch || undefined)}
                    className="px-4 py-2 bg-slate-900 border border-white/10 hover:border-white/20 text-slate-300 font-bold rounded-xl text-xxs uppercase tracking-wider transition flex items-center gap-1 shrink-0"
                  >
                    <RefreshCw size={12} className={loadingQuotes ? 'animate-spin' : ''} />
                    Load Quotes
                  </button>
                  {quoteSearch.trim() && (
                    <button
                      type="button"
                      onClick={handleWipeTickerQuotes}
                      className="px-4 py-2 bg-red-950/40 border border-red-500/20 hover:border-red-500/40 text-red-400 font-bold rounded-xl text-xxs uppercase tracking-wider transition flex items-center gap-1 shrink-0"
                      title={`Wipe all EOD data for ${quoteSearch}`}
                    >
                      <Trash2 size={12} />
                      Wipe {quoteSearch}
                    </button>
                  )}
                  {selectedQuoteIds.length > 0 && (
                    <button
                      type="button"
                      onClick={handleMassDeleteQuotes}
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xxs uppercase tracking-wider transition flex items-center gap-1 shrink-0"
                    >
                      <Trash2 size={12} />
                      Delete Selected ({selectedQuoteIds.length})
                    </button>
                  )}
                </div>
              </div>

              {/* Data Table */}
              <div className="flex-1 overflow-y-auto">
                {loadingQuotes ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-2">
                    <RefreshCw size={20} className="text-indigo-400 animate-spin" />
                    <span className="text-[10px] text-slate-500">Loading quotes records...</span>
                  </div>
                ) : quotes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 border border-dashed border-white/5 rounded-2xl p-6 bg-slate-900/10 text-center">
                    <Database size={24} className="text-slate-600 mb-1" />
                    <p className="text-xs font-semibold text-slate-400">No quotes loaded</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Click 'Load Quotes' or search for a specific ticker above.</p>
                  </div>
                ) : (
                  <div className="border border-white/10 rounded-2xl overflow-hidden bg-slate-900/30 backdrop-blur-md">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-900/80 border-b border-white/10 text-slate-400 text-xxs font-bold uppercase tracking-wider">
                          <th className="py-2.5 px-3 font-semibold w-10">
                            <input
                              type="checkbox"
                              className="rounded border-white/10 bg-slate-950 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                              checked={quotes.length > 0 && selectedQuoteIds.length === quotes.length}
                              onChange={(e) => handleSelectAllQuotes(e.target.checked)}
                            />
                          </th>
                          <th className="py-2.5 px-3 font-semibold">Ticker</th>
                          <th className="py-2.5 px-3 font-semibold">Date</th>
                          <th className="py-2.5 px-3 font-semibold">Adj Close Price</th>
                          <th className="py-2.5 px-3 font-semibold">Volume</th>
                          <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-[11px] font-mono">
                        {quotes.map((q) => {
                          const isEditing = editingQuoteId === q.id;
                          const isUpdating = updatingQuoteId === q.id;
                          const isChecked = selectedQuoteIds.includes(q.id);

                          return (
                            <tr key={q.id} className="hover:bg-white/[0.01] transition-colors">
                              <td className="py-2.5 px-3 font-sans w-10">
                                <input
                                  type="checkbox"
                                  className="rounded border-white/10 bg-slate-950 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                  checked={isChecked}
                                  onChange={(e) => handleSelectQuote(q.id, e.target.checked)}
                                />
                              </td>
                              <td className="py-2.5 px-3 font-sans font-bold text-white uppercase">{q.ticker}</td>
                              <td className="py-2.5 px-3 text-slate-400">{q.date}</td>
                              <td className="py-2.5 px-3">
                                {isEditing ? (
                                  <input
                                    type="number"
                                    step="0.0001"
                                    value={editPrice}
                                    onChange={(e) => setEditPrice(e.target.value)}
                                    className="bg-slate-950 border border-white/20 rounded py-0.5 px-1.5 text-xs text-white max-w-[80px] focus:outline-none focus:border-indigo-500"
                                  />
                                ) : (
                                  <span className="text-slate-200">${q.adj_close.toFixed(2)}</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-slate-500">
                                {isEditing ? (
                                  <input
                                    type="number"
                                    value={editVolume}
                                    placeholder="N/A"
                                    onChange={(e) => setEditVolume(e.target.value)}
                                    className="bg-slate-950 border border-white/20 rounded py-0.5 px-1.5 text-xs text-white max-w-[100px] focus:outline-none focus:border-indigo-500"
                                  />
                                ) : (
                                  q.volume ? q.volume.toLocaleString() : '—'
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {isEditing ? (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleSaveEditQuote(q)}
                                      disabled={isUpdating}
                                      className="p-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded"
                                      title="Save changes"
                                    >
                                      <Check size={11} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingQuoteId(null)}
                                      disabled={isUpdating}
                                      className="p-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded"
                                      title="Cancel"
                                    >
                                      <X size={11} />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleStartEditQuote(q)}
                                      className="p-1 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded border border-white/10"
                                      title="Edit Price/Volume"
                                    >
                                      <Edit2 size={11} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteQuote(q)}
                                      className="p-1 bg-slate-900 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 rounded border border-white/10"
                                      title="Delete Row"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>

          </div>
        )}
      </div>
    </div>
  );
}
