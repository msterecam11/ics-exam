export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "white", minHeight: "100vh" }}>
      {children}
    </div>
  )
}
