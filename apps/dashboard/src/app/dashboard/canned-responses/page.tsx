import CannedResponses from "../settings/_components/workspace/CannedResponses"

export default function CannedResponsesPage() {
  return (
    <div className="p-5 md:p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight">Canned Responses</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Reusable reply templates. Type <span className="font-mono bg-muted px-1 rounded text-xs">/</span> in the composer to insert one.
        </p>
      </div>
      <CannedResponses />
    </div>
  )
}
