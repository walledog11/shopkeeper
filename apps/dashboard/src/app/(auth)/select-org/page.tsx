"use client";

import { useOrganizationList } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Building2, Loader2 } from "lucide-react";
import { OrgAvatar } from "@/components/OrgAvatar";

export default function SelectOrgPage() {
  const { isLoaded, userMemberships, setActive } = useOrganizationList({
    userMemberships: { infinite: false },
  });
  const router = useRouter();

  async function handleSelect(orgId: string) {
    await setActive?.({ organization: orgId });
    router.push("/dashboard");
  }

  const orgs = userMemberships?.data ?? [];

  return (
    <div className="min-h-screen relative flex items-center justify-center bg-slate-50/50 overflow-hidden px-4 font-sans">

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-yellow-400/15 blur-[100px] rounded-full pointer-events-none" />

      <Link
        href="/"
        className="absolute top-6 left-6 sm:top-8 sm:left-8 flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="hidden sm:inline">Back to website</span>
      </Link>

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Select a workspace</h1>
          <p className="text-sm text-slate-500 mt-1">Choose the workspace you want to work in.</p>
        </div>

        <div className="w-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {!isLoaded ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : orgs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-slate-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">No workspaces yet</p>
                <p className="text-xs text-slate-500 mt-0.5">Create your first workspace to get started.</p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {orgs.map((membership: any) => {
                const org = membership.organization;
                return (
                  <li key={org.id}>
                    <button
                      onClick={() => handleSelect(org.id)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors text-left"
                    >
                      <OrgAvatar name={org.name} imageUrl={org.imageUrl} className="w-8 h-8 rounded-md bg-slate-900 text-white text-xs" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{org.name}</p>
                        <p className="text-xs text-slate-400 truncate">{membership.role}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="px-4 py-3 border-t border-slate-100">
            <Link
              href="/create-org"
              className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-900 transition-colors"
            >
              <div className="w-6 h-6 rounded-md border border-slate-200 flex items-center justify-center">
                <Plus className="w-3.5 h-3.5 text-slate-500" />
              </div>
              Create a workspace
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
