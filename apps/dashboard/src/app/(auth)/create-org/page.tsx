"use client";

import { CreateOrganization } from "@clerk/nextjs";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function CreateOrgPage() {
  return (
    <div className="min-h-screen relative flex items-center justify-center bg-black overflow-hidden px-4 font-sans">

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-green-400/15 blur-[100px] rounded-full pointer-events-none" />

      <Link
        href="/select-org"
        className="absolute top-6 left-6 sm:top-8 sm:left-8 flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="hidden sm:inline">Back to workspaces</span>
      </Link>

      <div className="relative z-10 w-full max-w-md flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Create a workspace</h1>
          <p className="text-sm text-slate-500 mt-1">Set up a new workspace for your team.</p>
        </div>

        <CreateOrganization
          afterCreateOrganizationUrl="/connect"
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "rounded-[2rem] shadow-sm border border-slate-200 w-full",
              headerTitle: "text-slate-900 font-extrabold",
              headerSubtitle: "text-slate-500",
              formButtonPrimary: "bg-slate-900 hover:bg-slate-800 rounded-full font-bold",
              formFieldInput: "rounded-lg border-slate-200 bg-slate-50 focus:bg-white focus:ring-green-400",
            }
          }}
        />
      </div>
    </div>
  );
}
