"use client";

import { useEffect, useState } from "react";
import { PinnedScene, STORY_SCENE_LABEL, type Beat } from "./StoryVisuals";

// The beat is the last story block whose top has crossed the middle of the
// viewport. Wide screens only: narrow ones show each beat inline instead.
export function StoryStage() {
  const [beat, setBeat] = useState<Beat>(0);

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    let frame = 0;

    function update() {
      frame = 0;
      if (!wide.matches) return;
      const line = window.innerHeight * 0.55;
      let active = 0;
      for (const block of document.querySelectorAll<HTMLElement>("[data-story-beat]")) {
        if (block.getBoundingClientRect().top < line) active = Math.max(active, Number(block.dataset.storyBeat));
      }
      setBeat(active as Beat);
    }

    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <div role="img" aria-label={STORY_SCENE_LABEL}>
      <div aria-hidden>
        <PinnedScene beat={beat} />
      </div>
    </div>
  );
}
