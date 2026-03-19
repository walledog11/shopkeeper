"use client";

import Link from "next/link";
import { Bot, ArrowLeft } from "lucide-react";
import { SignUp } from "@clerk/nextjs";
import { motion } from "motion/react";
import { DotPattern } from "@/components/ui/dot-pattern";

export default function SignUpPage() {
  return (
    <div className="min-h-screen relative flex items-center justify-center bg-slate-50 overflow-hidden px-4 py-12 font-sans">

      {/* 1. Dot Pattern Background */}
      <DotPattern
        width={24}
        height={24}
        cx={1}
        cy={1}
        cr={1}
        className="opacity-40 [mask-image:radial-gradient(900px_circle_at_center,white,transparent)]"
        glow={true}
      />

      {/* 2. Subtle Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] opacity-20 pointer-events-none blur-[100px] bg-gradient-to-b from-yellow-400 to-transparent z-0" />

      {/* Back to Home Navigation */}
      <Link
        href="/"
        className="absolute top-6 left-6 sm:top-8 sm:left-8 flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-slate-800 transition-colors z-20"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="hidden sm:inline">Back to website</span>
      </Link>

      {/* Main Content Container */}
      <div className="relative z-10 w-full max-w-md flex flex-col items-center gap-8">

        {/* 3. Floating Sticky Note 1 (Yellow) */}
        <motion.div
          animate={{ y: [-5, 5, -5], rotate: [6, 8, 6] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-8 -right-4 sm:-top-12 sm:-right-20 w-24 h-24 sm:w-32 sm:h-32 bg-yellow-200 shadow-lg flex items-center justify-center p-3 z-0"
          style={{ fontFamily: "var(--font-caveat)" }}
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-2.5 bg-yellow-400/30 -mt-1 shadow-sm mix-blend-multiply" />
          <span className="text-yellow-950 text-sm sm:text-lg leading-tight text-center rotate-[-2deg] font-bold">
            Get back to inbox zero!
          </span>
        </motion.div>

        {/* 4. Floating Sticky Note 2 (Blue) */}
        <motion.div
          animate={{ y: [5, -5, 5], rotate: [-8, -6, -8] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -bottom-8 -left-4 sm:-bottom-10 sm:-left-16 w-20 h-20 sm:w-28 sm:h-28 bg-blue-200 shadow-lg flex items-center justify-center p-3 z-0"
          style={{ fontFamily: "var(--font-caveat)" }}
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-2 bg-blue-400/30 -mt-1 shadow-sm mix-blend-multiply" />
          <span className="text-blue-950 text-xs sm:text-base leading-tight text-center rotate-[2deg] font-bold">
            No more sprawl.
          </span>
        </motion.div>

        {/* Brand Logo Header */}
        <div className="relative flex justify-center z-10">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center group-hover:border-yellow-300 transition-colors">
              <Bot className="w-6 h-6 text-slate-800 group-hover:text-yellow-500 transition-colors" />
            </div>
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight drop-shadow-sm">clerk</span>
          </Link>
        </div>

        <SignUp
          routing="hash"
          signInUrl="/login"
          fallbackRedirectUrl="/dashboard"
          appearance={{
            elements: {
              rootBox: "w-full z-10 relative",
              card: "rounded-[2rem] shadow-2xl border border-slate-200 bg-white/80 backdrop-blur-xl w-full",
              headerTitle: "text-slate-900 font-extrabold",
              headerSubtitle: "text-slate-500",
              formButtonPrimary: "bg-slate-900 hover:bg-slate-800 rounded-full font-bold",
              footerActionLink: "text-yellow-600 hover:text-yellow-700 font-bold",
              formFieldInput: "rounded-xl border-slate-200 bg-white/50 focus:bg-white focus:ring-yellow-400",
              socialButtonsBlockButton: "rounded-full border-slate-200 font-bold text-slate-700 hover:bg-slate-50 bg-white",
            }
          }}
        />
      </div>
    </div>
  );
}
