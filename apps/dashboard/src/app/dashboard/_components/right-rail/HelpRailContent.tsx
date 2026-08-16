"use client";

import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { ALL_CATEGORIES, withAgentName, type Article, type Category } from "../help/content/index";
import HelpArticle from "../help/HelpArticle";
import HelpCategory from "../help/HelpCategory";
import HelpHome from "../help/HelpHome";

type View =
  | { type: "home" }
  | { type: "category"; category: Category }
  | { type: "article"; category: Category; article: Article };

export function HelpRailContent({
  agentName,
  active,
}: {
  agentName: string;
  active: boolean;
}) {
  const [view, setView] = useState<View>({ type: "home" });

  useEffect(() => {
    if (active) setView({ type: "home" });
  }, [active]);

  const goBack = () => {
    if (view.type === "article") setView({ type: "category", category: view.category });
    else if (view.type === "category") setView({ type: "home" });
  };

  const subtitle =
    view.type === "home"
      ? "Browse topics"
      : view.type === "category"
        ? withAgentName(view.category.title, agentName)
        : withAgentName(view.article.title, agentName);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {view.type !== "home" && (
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3 shrink-0">
          <button
            type="button"
            onClick={goBack}
            className="text-muted-foreground transition-colors hover:text-foreground shrink-0"
            aria-label="Go back"
          >
            <ChevronLeft className="size-4" />
          </button>
          <p className="min-w-0 truncate text-sm font-medium text-foreground">{subtitle}</p>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {view.type === "home" && (
          <HelpHome
            categories={ALL_CATEGORIES}
            agentName={agentName}
            onSelectCategory={(cat) => setView({ type: "category", category: cat })}
          />
        )}
        {view.type === "category" && (
          <HelpCategory
            category={view.category}
            agentName={agentName}
            onSelectArticle={(article) =>
              setView({ type: "article", category: view.category, article })
            }
          />
        )}
        {view.type === "article" && (
          <HelpArticle article={view.article} agentName={agentName} />
        )}
      </div>
    </div>
  );
}
