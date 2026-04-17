"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

export default function NotificationBar() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div className="relative flex items-center justify-center w-full px-12 py-3 bg-gradient-to-l from-gray-50 to-green-700 text-[#1a1a1a] shadow-sm">
      {/* Container for the content */}
      <div className="flex flex-col md:flex-row items-center gap-2 md:gap-6 text-sm md:text-[15px]">
        
        {/* Faux Logo */}
        <div className="flex items-center gap-1 text-xl tracking-tight">
          <span className="font-bold">clerk</span>
          <span className="font-light">relate</span>
        </div>

        {/* Message */}
        <div className="text-center md:text-left text-gray-800">
          Learn how to reduce your customer support burden by 90%
        </div>

        {/* CTA Link */}
        <Link 
          href="#" 
          className="font-semibold underline decoration-1 underline-offset-4 hover:text-black transition-colors"
        >
          Register for free
        </Link>
      </div>

      {/* Close Button */}
      <button
        onClick={() => setIsVisible(false)}
        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 hover:bg-black/5 rounded-full transition-colors"
        aria-label="Close banner"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}