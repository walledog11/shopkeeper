"use client";

import { Suspense, useCallback, useState } from "react";
import { UserPlus, X, Shield, User, Mail, Trash2 } from "lucide-react";
import { timeAgo } from "@/lib/format/date";
import { errorMessageFromUnknown } from "@/lib/api/fetcher";
import { OrgAvatar } from "@/components/OrgAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  deleteTeamMember,
  inviteTeamMember,
  revokeTeamInvitation,
  type TeamInvitation,
  type TeamMember,
} from "./team-page-requests";

interface Props {
  initialMembers: TeamMember[];
  initialInvitations: TeamInvitation[];
  currentUserId: string;
  isAdmin: boolean;
  initialShowInviteModal: boolean;
}

function roleLabel(role: string) {
  if (role === "org:admin") return "Admin";
  return "Member";
}

function RolePill({ role }: { role: string }) {
  const isAdmin = role === "org:admin";
  return (
    <Badge variant="ghost" className={`text-xs font-semibold gap-1 ${
      isAdmin ? "bg-foreground/[0.08] text-foreground/70" : "bg-foreground/[0.05] text-foreground/40"
    }`}>
      {isAdmin ? <Shield className="size-2.5" /> : <User className="size-2.5" />}
      {roleLabel(role)}
    </Badge>
  );
}

export default function TeamPageClient(props: Props) {
  return (
    <Suspense fallback={null}>
      <TeamPageContent {...props} />
    </Suspense>
  );
}

function useTeamPageState({ initialMembers, initialInvitations, initialShowInviteModal }: Props) {
  const [members, setMembers] = useState(initialMembers);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [inviteParamDismissed, setInviteParamDismissed] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const showInviteModal = (initialShowInviteModal && !inviteParamDismissed) || inviteModalOpen;
  const setShowInviteModal = useCallback((open: boolean) => {
    if (!open && initialShowInviteModal) {
      setInviteParamDismissed(true);
      window.history.replaceState(null, "", "/dashboard/team");
    } else if (open) {
      setInviteParamDismissed(false);
    }
    setInviteModalOpen(open);
  }, [initialShowInviteModal]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("org:member");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [removalError, setRemovalError] = useState<string | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError("");
    try {
      const newInvite = await inviteTeamMember(inviteEmail.trim(), inviteRole);
      setInvitations(prev => [newInvite, ...prev]);
      setInviteEmail("");
      setShowInviteModal(false);
    } catch (err) {
      setInviteError(errorMessageFromUnknown(err, "Failed to invite member."));
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    setRemoving(userId);
    setRemovalError(null);
    try {
      await deleteTeamMember(userId);
      setMembers(prev => prev.filter(m => m.userId !== userId));
    } catch (error) {
      setRemovalError(errorMessageFromUnknown(error, "Failed to remove member."));
    } finally {
      setRemoving(null);
    }
  }

  async function handleRevokeInvite(invitationId: string) {
    setRemoving(invitationId);
    setRemovalError(null);
    try {
      await revokeTeamInvitation(invitationId);
      setInvitations(prev => prev.filter(i => i.id !== invitationId));
    } catch (error) {
      setRemovalError(errorMessageFromUnknown(error, "Failed to revoke invitation."));
    } finally {
      setRemoving(null);
    }
  }

  return {
    handleInvite,
    handleRemoveMember,
    handleRevokeInvite,
    invitations,
    inviteEmail,
    inviteError,
    inviteRole,
    inviting,
    members,
    removalError,
    removing,
    setInviteEmail,
    setInviteRole,
    setShowInviteModal,
    showInviteModal,
  };
}

function TeamPageContent(props: Props) {
  const {
    handleInvite,
    handleRemoveMember,
    handleRevokeInvite,
    invitations,
    inviteEmail,
    inviteError,
    inviteRole,
    inviting,
    members,
    removalError,
    removing,
    setInviteEmail,
    setInviteRole,
    setShowInviteModal,
    showInviteModal,
  } = useTeamPageState(props);
  const { currentUserId, isAdmin } = props;

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-5 md:py-7 space-y-6 pb-10">

        {isAdmin && (
          <div className="flex items-center justify-end">
            <button type="button"
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-1.5 text-sm font-semibold text-background bg-foreground hover:bg-foreground/90 rounded-md px-3.5 py-2 transition-colors"
            >
              <UserPlus className="size-4" /> Invite member
            </button>
          </div>
        )}

        {removalError && (
          <p className="text-xs text-red-500" aria-live="polite">{removalError}</p>
        )}

        {/* Members list */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground/75">Members</h2>
          </div>
          <div className="divide-y divide-border">
            {members.map(member => {
              const fullName = [member.firstName, member.lastName].filter(Boolean).join(" ") || member.identifier;
              const isSelf = member.userId === currentUserId;
              return (
                <div key={member.id} className="flex items-center gap-3 px-5 py-3.5">
                  <OrgAvatar name={fullName} imageUrl={member.imageUrl} className="size-9 rounded-full bg-foreground/[0.10] text-foreground/60 font-semibold text-xs shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground/80 truncate">{fullName}</span>
                      {isSelf && <Badge variant="ghost" className="text-xs font-semibold text-foreground/30 bg-foreground/[0.08]">You</Badge>}
                    </div>
                    <p className="text-xs text-foreground/30 truncate">{member.identifier}</p>
                  </div>
                  <RolePill role={member.role} />
                  <span className="hidden md:block text-xs text-foreground/25 shrink-0">
                    Joined {timeAgo(new Date(member.createdAt).toISOString())}
                  </span>
                  {isAdmin && !isSelf && (
                    <button type="button"
                      onClick={() => handleRemoveMember(member.userId)}
                      disabled={removing === member.userId}
                      className="p-1.5 rounded-md text-foreground/20 hover:text-red-400 hover:bg-red-400/[0.08] transition-colors disabled:opacity-50"
                      title="Remove member"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Pending invitations */}
        {invitations.length > 0 && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground/75">Pending invitations</h2>
              <Badge variant="ghost" className="text-xs font-semibold text-foreground/40 bg-foreground/[0.08]">{invitations.length}</Badge>
            </div>
            <div className="divide-y divide-border">
              {invitations.map(invite => (
                <div key={invite.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="size-9 rounded-full bg-foreground/[0.08] flex items-center justify-center shrink-0">
                    <Mail className="size-4 text-foreground/30" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground/60 truncate">{invite.emailAddress}</p>
                    <p className="text-xs text-foreground/30">Invited {timeAgo(new Date(invite.createdAt).toISOString())}</p>
                  </div>
                  <RolePill role={invite.role} />
                  {isAdmin && (
                    <button type="button"
                      onClick={() => handleRevokeInvite(invite.id)}
                      disabled={removing === invite.id}
                      className="p-1.5 rounded-md text-foreground/20 hover:text-red-400 hover:bg-red-400/[0.08] transition-colors disabled:opacity-50"
                      title="Revoke invitation"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Invite modal */}
      <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
        <DialogContent className="border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground/85">Invite team member</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4">
            <div>
              <span className="block text-xs font-semibold text-foreground/60 mb-1.5">Email address</span>
              <input
                aria-label="Email address"
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                required
                className="w-full px-3 py-2 text-sm text-foreground/80 border border-foreground/[0.12] bg-foreground/[0.06] rounded-md focus:outline-none focus:border-foreground/[0.25] placeholder:text-foreground/25 transition"
              />
            </div>
            <div>
              <span className="block text-xs font-semibold text-foreground/60 mb-1.5">Role</span>
              <select
                aria-label="Role"
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
                className="w-full px-3 py-2 text-sm text-foreground/80 border border-foreground/[0.12] bg-foreground/[0.06] rounded-md focus:outline-none focus:border-foreground/[0.25] transition"
              >
                <option value="org:member">Member — can view and respond to tickets</option>
                <option value="org:admin">Admin — full access including settings</option>
              </select>
            </div>
            {inviteError && (
              <p className="text-xs text-red-500 bg-red-500/[0.08] border border-red-500/20 rounded-md px-3 py-2">{inviteError}</p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowInviteModal(false)}
                className="border-foreground/[0.12] text-foreground/70 hover:bg-foreground/[0.06]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={inviting || !inviteEmail.trim()}
                className="bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
              >
                {inviting ? "Sending…" : "Send invite"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
