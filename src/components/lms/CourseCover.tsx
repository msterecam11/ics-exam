// A course cover that is never an empty grey box. With a picture we show the
// picture; without one we draw a branded panel carrying the course code (or the
// initials), so a catalogue with no artwork still looks deliberate.

const BRAND = "#1B4F8A"

/** Same title always gets the same tint, so a course looks stable between visits. */
function tint(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return h
}

function initials(title: string) {
  return title.split(/\s+/).filter(w => /[a-z0-9]/i.test(w)).slice(0, 2).map(w => w[0]!.toUpperCase()).join("")
}

export default function CourseCover({
  title, code, imageUrl, colour, className = "h-28", badge,
}: {
  title: string
  code?: string | null
  imageUrl?: string | null
  colour?: string | null
  className?: string
  badge?: React.ReactNode
}) {
  const label = (code ?? "").trim() || initials(title)
  const hue = tint(title)
  const base = colour || BRAND

  return (
    <div className={`relative shrink-0 overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${base} 0%, hsl(${hue} 45% 28%) 100%)` }}>
      {imageUrl ? (
        // Course artwork is usually a wide banner carrying its own title, so it
        // is fitted whole rather than cropped, over a blurred copy of itself —
        // no letterbox bars, and the title stays readable at any card size.
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-60" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full object-contain" />
        </>
      ) : (
        <>
          {/* A soft arc, so the panel reads as artwork rather than a colour fill. */}
          <div className="absolute -right-8 -top-10 w-32 h-32 rounded-full bg-white/10" />
          <div className="absolute -left-10 -bottom-12 w-28 h-28 rounded-full bg-black/10" />
          <span className="absolute inset-0 flex items-center justify-center text-white/90 font-bold tracking-[0.18em] text-base">
            {label}
          </span>
        </>
      )}
      {badge}
    </div>
  )
}
