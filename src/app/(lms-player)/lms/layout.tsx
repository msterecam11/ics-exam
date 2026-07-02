import SessionExpiredGuard from "@/components/lms/SessionExpiredGuard"

export default function LmsPlayerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SessionExpiredGuard loginUrl="/lms/login" reason="For security, your learning session has timed out." />
      {children}
    </>
  )
}
