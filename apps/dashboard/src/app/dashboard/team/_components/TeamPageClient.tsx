"use client";

import { useState } from "react";
import { UserPlus, X, Shield, User, Mail, MoreHorizontal, Trash2 } from "lucide-react";
import { timeAgo } from "@/lib/utils";

interface Member {
  id: string;
  userId: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  identifier: string;
  role: string;
  createdAt: number;
}

interface Invitation {
  id: string;
  emailAddress: string;
  role: string;
  createdAt: number;
}

interface Props {
  initialMembers: Member[];
  initialInvitations: Invitation[];
  currentUserId: string;
}

function roleLabel(role: string) {
  if (role === "org:admin") return "Admin";
  return "Member";
}

function RolePill({ role }: { role: string }) {
  const isAdmin = role === "org:admin";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
      isAdmin ? "bg-[#1c3b38]/10 text-[#1c3b38]" : "bg-slate-100 text-slate-500"
    }`}>
      {isAdmin ? <Shield className="w-2.5 h-2.5" /> : <User className="w-2.5 h-2.5" />}
      {roleLabel(role)}
    </span>
  );
}

function Avatar({ name, imageUrl }: { name: string; imageUrl: string | null }) {
  const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-semibold text-xs overflow-hidden shrink-0 ring-2 ring-white">
      {imageUrl ? <img src={imageUrl} alt={name} className="w-full h-full object-cover" /> : initials}
    </div>
  );
}

export default function TeamPageClient({ initialMembers, initialInvitations, currentUserId }: Props) {
  const [members, setMembers] = useState(initialMembers);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("org:member");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError("");
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailAddress: inviteEmail.trim(), role: inviteRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to invite");
      }
      const newInvite = await res.json();
      setInvitations(prev => [newInvite, ...prev]);
      setInviteEmail("");
      setShowInviteModal(false);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    setRemoving(userId);
    try {
      await fetch(`/api/team?userId=${userId}`, { method: "DELETE" });
      setMembers(prev => prev.filter(m => m.userId !== userId));
    } finally {
      setRemoving(null);
    }
  }

  async function handleRevokeInvite(invitationId: string) {
    setRemoving(invitationId);
    try {
      await fetch(`/api/team?invitationId=${invitationId}`, { method: "DELETE" });
      setInvitations(prev => prev.filter(i => i.id !== invitationId));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-5 md:py-7 space-y-6 pb-10">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Team</h1>
            <p className="text-sm text-slate-400 mt-0.5">{members.length} member{members.length !== 1 ? "s" : ""}</p>
          </div>
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 bg-yellow-400 hover:bg-yellow-300 rounded-md px-3.5 py-2 transition-all shadow-sm"
          >
            <UserPlus className="w-4 h-4" /> Invite member
          </button>
        </div>

        {/* Members list */}
        <div className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Members</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {members.map(member => {
              const fullName = [member.firstName, member.lastName].filter(Boolean).join(" ") || member.identifier;
              const isSelf = member.userId === currentUserId;
              return (
                <div key={member.id} className="flex items-center gap-3 px-5 py-3.5">
                  <Avatar name={fullName} imageUrl={member.imageUrl} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900 truncate">{fullName}</span>
                      {isSelf && <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">You</span>}
                    </div>
                    <p className="text-xs text-slate-400 truncate">{member.identifier}</p>
                  </div>
                  <RolePill role={member.role} />
                  <span className="hidden md:block text-xs text-slate-400 shrink-0">
                    Joined {timeAgo(new Date(member.createdAt).toISOString())}
                  </span>
                  {!isSelf && (
                    <button
                      onClick={() => handleRemoveMember(member.userId)}
                      disabled={removing === member.userId}
                      className="p-1.5 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                      title="Remove member"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Pending invitations */}
        {invitations.length > 0 && (
          <div className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">Pending invitations</h2>
              <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{invitations.length}</span>
            </div>
            <div className="divide-y divide-slate-50">
              {invitations.map(invite => (
                <div key={invite.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{invite.emailAddress}</p>
                    <p className="text-xs text-slate-400">Invited {timeAgo(new Date(invite.createdAt).toISOString())}</p>
                  </div>
                  <RolePill role={invite.role} />
                  <button
                    onClick={() => handleRevokeInvite(invite.id)}
                    disabled={removing === invite.id}
                    className="p-1.5 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                    title="Revoke invitation"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Invite modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowInviteModal(false)} />
          <div className="relative bg-white rounded-md shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-slate-900">Invite team member</h2>
              <button onClick={() => setShowInviteModal(false)} className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  required
                  autoFocus
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1c3b38]/20 focus:border-[#1c3b38] transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Role</label>
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1c3b38]/20 focus:border-[#1c3b38] transition bg-white"
                >
                  <option value="org:member">Member — can view and respond to tickets</option>
                  <option value="org:admin">Admin — full access including settings</option>
                </select>
              </div>
              {inviteError && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-md px-3 py-2">{inviteError}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="flex-1 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting || !inviteEmail.trim()}
                  className="flex-1 py-2 text-sm font-semibold text-slate-800 bg-yellow-400 hover:bg-yellow-300 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {inviting ? "Sending…" : "Send invite"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
