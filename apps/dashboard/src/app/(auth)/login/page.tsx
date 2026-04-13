import Link from "next/link";
import { Bot, ArrowLeft } from "lucide-react";
import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
  return (
    <div className="min-h-screen relative flex items-center justify-center bg-black overflow-hidden px-4 font-sans">

      {/* Subtle Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-green-400/15 blur-[100px] rounded-full pointer-events-none" />

      {/* Back to Home Navigation */}
      <Link
        href="/"
        className="absolute top-6 left-6 sm:top-8 sm:left-8 flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="hidden sm:inline">Back to website</span>
      </Link>

      <div className="relative z-10 w-full max-w-md flex flex-col items-center gap-8">

        {/* Brand Logo Header */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center group-hover:border-green-300 transition-colors">
            <Bot className="w-6 h-6 text-slate-800 group-hover:text-green-500 transition-colors" />
          </div>
          <span className="text-3xl font-extrabold text-slate-900 tracking-tight">clerk</span>
        </Link>

        <SignIn
          routing="hash"
          signUpUrl="/signup"
          fallbackRedirectUrl="/dashboard"
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "rounded-[2rem] shadow-sm border border-slate-200 w-full",
              headerTitle: "text-slate-900 font-extrabold",
              headerSubtitle: "text-slate-500",
              formButtonPrimary: "bg-slate-900 hover:bg-slate-800 rounded-full font-bold",
              footerActionLink: "text-green-600 hover:text-green-700 font-bold",
              formFieldInput: "rounded-xl border-slate-200 bg-slate-50 focus:bg-white focus:ring-green-400",
              socialButtonsBlockButton: "rounded-full border-slate-200 font-bold text-slate-700 hover:bg-slate-50",
            }
          }}
        />
      </div>
    </div>
  );
}
