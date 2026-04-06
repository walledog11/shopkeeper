"use client";

import { useState } from "react";
import { UserPlus, X, Shield, User, Mail, Trash2 } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { OrgAvatar } from "@/components/OrgAvatar";
import { Badge } from "@/components/ui/badge";

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
    <Badge variant="ghost" className={`text-[11px] font-semibold gap-1 ${
      isAdmin ? "bg-violet-400/10 text-violet-400" : "bg-white/[0.08] text-white/40"
    }`}>
      {isAdmin ? <Shield className="w-2.5 h-2.5" /> : <User className="w-2.5 h-2.5" />}
      {roleLabel(role)}
    </Badge>
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
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-5 md:py-7 space-y-6 pb-10">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white/80">Team</h1>
            <p className="text-sm text-white/30 mt-0.5">{members.length} member{members.length !== 1 ? "s" : ""}</p>
          </div>
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-1.5 text-sm font-semibold text-black bg-yellow-400 hover:bg-yellow-300 rounded-md px-3.5 py-2 transition-all"
          >
            <UserPlus className="w-4 h-4" /> Invite member
          </button>
        </div>

        {/* Members list */}
        <div className="bg-card rounded-md border border-white/[0.08] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/[0.07]">
            <h2 className="text-sm font-semibold text-white/70">Members</h2>
          </div>
          <div className="divide-y divide-white/[0.05]">
            {members.map(member => {
              const fullName = [member.firstName, member.lastName].filter(Boolean).join(" ") || member.identifier;
              const isSelf = member.userId === currentUserId;
              return (
                <div key={member.id} className="flex items-center gap-3 px-5 py-3.5">
                  <OrgAvatar name={fullName} imageUrl={member.imageUrl} className="w-9 h-9 rounded-full bg-white/[0.10] text-white/60 font-semibold text-xs shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white/80 truncate">{fullName}</span>
                      {isSelf && <Badge variant="ghost" className="text-[10px] font-semibold text-white/30 bg-white/[0.08]">You</Badge>}
                    </div>
                    <p className="text-xs text-white/30 truncate">{member.identifier}</p>
                  </div>
                  <RolePill role={member.role} />
                  <span className="hidden md:block text-xs text-white/25 shrink-0">
                    Joined {timeAgo(new Date(member.createdAt).toISOString())}
                  </span>
                  {!isSelf && (
                    <button
                      onClick={() => handleRemoveMember(member.userId)}
                      disabled={removing === member.userId}
                      className="p-1.5 rounded-md text-white/20 hover:text-red-400 hover:bg-red-400/[0.08] transition-colors disabled:opacity-50"
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
          <div className="bg-card rounded-md border border-white/[0.08] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.07]">
              <h2 className="text-sm font-semibold text-white/70">Pending invitations</h2>
              <Badge variant="ghost" className="text-[11px] font-semibold text-white/30 bg-white/[0.08]">{invitations.length}</Badge>
            </div>
            <div className="divide-y divide-white/[0.05]">
              {invitations.map(invite => (
                <div key={invite.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4 text-white/30" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white/60 truncate">{invite.emailAddress}</p>
                    <p className="text-xs text-white/30">Invited {timeAgo(new Date(invite.createdAt).toISOString())}</p>
                  </div>
                  <RolePill role={invite.role} />
                  <button
                    onClick={() => handleRevokeInvite(invite.id)}
                    disabled={removing === invite.id}
                    className="p-1.5 rounded-md text-white/20 hover:text-red-400 hover:bg-red-400/[0.08] transition-colors disabled:opacity-50"
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
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowInviteModal(false)} />
          <div className="relative bg-card border border-white/[0.10] rounded-md shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-white/80">Invite team member</h2>
              <button onClick={() => setShowInviteModal(false)} className="p-1.5 rounded-md text-white/30 hover:text-white/70 hover:bg-white/[0.08] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-white/50 mb-1.5">Email address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  required
                  autoFocus
                  className="w-full px-3 py-2 text-sm text-white/70 border border-white/[0.12] bg-white/[0.06] rounded-md focus:outline-none focus:border-white/[0.25] placeholder:text-white/20 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/50 mb-1.5">Role</label>
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-white/70 border border-white/[0.12] bg-white/[0.06] rounded-md focus:outline-none focus:border-white/[0.25] transition"
                >
                  <option value="org:member">Member — can view and respond to tickets</option>
                  <option value="org:admin">Admin — full access including settings</option>
                </select>
              </div>
              {inviteError && (
                <p className="text-xs text-red-400 bg-red-400/[0.08] border border-red-400/20 rounded-md px-3 py-2">{inviteError}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="flex-1 py-2 text-sm font-medium text-white/50 border border-white/[0.10] rounded-md hover:bg-white/[0.05] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting || !inviteEmail.trim()}
                  className="flex-1 py-2 text-sm font-semibold text-black bg-yellow-400 hover:bg-yellow-300 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
