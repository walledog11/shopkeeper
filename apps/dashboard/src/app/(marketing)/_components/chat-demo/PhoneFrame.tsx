import type { ReactNode } from "react"
import { DynamicIsland, IOS_FONT, PhoneStatusBar } from "./shared"

const sideButton = "absolute rounded-[2px] bg-gradient-to-b from-[#4c4f55] via-[#232529] to-[#4a4d53]"

/**
 * Realistic iPhone shell: titanium rim, inner bezel, side buttons, Dynamic
 * Island, status bar and home indicator. The hardware chrome overlays stay
 * fixed while children (app screens) render — or slide — beneath them.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <span aria-hidden className={`${sideButton} -left-[2px] top-[17.5%] h-[3.2%] w-[3px]`} />
      <span aria-hidden className={`${sideButton} -left-[2px] top-[24%] h-[6%] w-[3px]`} />
      <span aria-hidden className={`${sideButton} -left-[2px] top-[31.5%] h-[6%] w-[3px]`} />
      <span aria-hidden className={`${sideButton} -right-[2px] top-[26%] h-[9.5%] w-[3px]`} />
      <div className="relative rounded-[54px] bg-[linear-gradient(155deg,#5c5f66_0%,#303236_16%,#191a1d_42%,#2b2d31_74%,#585b61_100%)] p-[3px] shadow-[0_90px_140px_-60px_rgba(22,20,19,0.55),0_42px_70px_-40px_rgba(22,20,19,0.45),0_10px_24px_-12px_rgba(22,20,19,0.3)]">
        <div className="rounded-[51px] bg-[#060607] p-[8px]">
          <div
            className="relative aspect-[393/852] overflow-hidden rounded-[43px] bg-white [container-type:inline-size]"
            style={{ fontFamily: IOS_FONT }}
          >
            {children}
            <PhoneStatusBar />
            <DynamicIsland />
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-[7px] left-1/2 z-40 h-[4px] w-[min(104px,35cqw)] -translate-x-1/2 rounded-full bg-black/30"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-50 rounded-[43px] bg-[linear-gradient(115deg,rgba(255,255,255,0)_40%,rgba(255,255,255,0.05)_46%,rgba(255,255,255,0.1)_50%,rgba(255,255,255,0.04)_54%,rgba(255,255,255,0)_60%)]"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
