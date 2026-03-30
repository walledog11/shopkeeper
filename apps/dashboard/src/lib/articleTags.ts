// Shared tag color maps for article UI

export const TAG_COLORS: Record<string, string> = {
  "Strategy": "bg-violet-50 text-violet-600",
  "Customer Service": "bg-sky-50 text-sky-600",
  "Agent Setup": "bg-indigo-50 text-indigo-600",
  "Workflow": "bg-amber-50 text-amber-600",
}

// Includes border color — used where a bordered badge is needed (e.g. breadcrumbs)
export const TAG_COLORS_BORDERED: Record<string, string> = {
  "Strategy": "bg-violet-50 text-violet-600 border-violet-100",
  "Customer Service": "bg-sky-50 text-sky-600 border-sky-100",
  "Agent Setup": "bg-indigo-50 text-indigo-600 border-indigo-100",
  "Workflow": "bg-amber-50 text-amber-600 border-amber-100",
}

export const DEFAULT_TAG_COLOR = "bg-slate-100 text-slate-500"
export const DEFAULT_TAG_COLOR_BORDERED = "bg-slate-100 text-slate-500 border-slate-200"
