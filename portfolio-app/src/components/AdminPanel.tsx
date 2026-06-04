// AdminPanel.tsx
// Dedicated dashboard panel for administrators to manage user accounts, toggle admin status, and lock users.

'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { adminGetUsers, adminUpdateUser, DBUser } from '../utils/dbClient';
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
  Clock
} from 'lucide-react';

interface AdminPanelProps {
  onBack: () => void;
}

export default function AdminPanel({ onBack }: AdminPanelProps) {
  const { user } = useAuth();
  const [users, setUsers] = useState<DBUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actioningUserId, setActioningUserId] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await adminGetUsers();
      setUsers(list);
    } catch (err: any) {
      console.error('Failed to load users:', err);
      setError(err?.message || 'Failed to retrieve users. Ensure you have administrator privileges.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

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
      
      // Update local state
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
      
      // Update local state
      setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, is_locked: newLockedState } : u));
      setSuccess(`Successfully ${newLockedState ? 'locked' : 'unlocked'} user ${targetUser.email}.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to update user lock status.');
    } finally {
      setActioningUserId(null);
    }
  };

  // Filter users based on query
  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-950 text-white font-sans">
      {/* Top Header */}
      <div className="flex items-center justify-between p-6 border-b border-white/10 bg-slate-900/40 backdrop-blur-md">
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
              Manage accounts, assign administrator roles, and configure user lockouts.
            </p>
          </div>
        </div>
        
        <button
          onClick={fetchUsers}
          disabled={loading}
          className="p-2.5 rounded-xl bg-slate-900 border border-white/5 hover:bg-slate-800 hover:border-white/10 text-slate-400 hover:text-white disabled:opacity-50 transition flex items-center gap-2 text-xs font-semibold"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Notifications */}
      <div className="px-6 pt-4 space-y-2">
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

      {/* Control Bar */}
      <div className="p-6 pb-2">
        <div className="relative">
          <span className="absolute left-3.5 inset-y-0 flex items-center text-slate-500">
            <Search size={16} />
          </span>
          <input
            type="text"
            placeholder="Search users by email or user ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900/60 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/60 transition"
          />
        </div>
      </div>

      {/* Main Grid/Table */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <RefreshCw size={24} className="text-indigo-400 animate-spin" />
            <span className="text-xs font-medium text-slate-400">Loading directory records...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border border-dashed border-white/10 rounded-2xl p-6 bg-slate-900/20 text-center">
            <Users size={32} className="text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-300">No users found</p>
            <p className="text-xs text-slate-500 mt-1">Try resetting the filters or verify profile entries exist.</p>
          </div>
        ) : (
          <div className="border border-white/10 rounded-2xl overflow-hidden bg-slate-900/30 backdrop-blur-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/80 border-b border-white/10 text-slate-400 text-xxs font-bold uppercase tracking-wider">
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
                    
                    return (
                      <tr 
                        key={item.id} 
                        className={`hover:bg-white/[0.02] transition-colors ${
                          item.is_locked ? 'bg-red-950/5' : ''
                        }`}
                      >
                        {/* Email Column */}
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

                        {/* ID Column */}
                        <td className="py-4 px-4 font-mono text-[10px] text-slate-500 hidden md:table-cell">
                          {item.id}
                        </td>

                        {/* Roles Badge Column */}
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

                        {/* Lock State Badge Column */}
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

                        {/* Action buttons */}
                        <td className="py-4 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Toggle Admin Privilege */}
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
                              title={isSelf ? 'Cannot change your own role' : `Make user ${item.is_admin ? 'standard' : 'admin'}`}
                            >
                              <Shield size={12} />
                              {item.is_admin ? 'Demote' : 'Grant Admin'}
                            </button>

                            {/* Toggle Lock Account */}
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
                              title={isSelf ? 'Cannot lock yourself' : `${item.is_locked ? 'Unlock' : 'Lock'} user account`}
                            >
                              {item.is_locked ? <Unlock size={12} /> : <Lock size={12} />}
                              {item.is_locked ? 'Unlock' : 'Lock'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
