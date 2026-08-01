export default function StudioSettingsPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Course Generator configuration. Per-course options (theme, client logo, language)
          are set in the Create wizard; global settings will appear here as they land.
        </p>
      </div>
      <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500">
        Nothing to configure yet.
      </div>
    </div>
  )
}
