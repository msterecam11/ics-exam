import Image from "next/image"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

// The privacy notice the sign-up form links to. The wording is the institute's
// own and is reproduced as given — a legal document is formatted here, never
// reworded. Update it by editing POLICY below.

export const metadata = {
  title: "Privacy Policy — ICS Aviation Training Institute",
  description: "How ICS Aviation Training Institute collects, uses, stores and protects personal data.",
}

const LAST_UPDATED = "23 September 2026"

type Section = { heading: string; body?: string[]; groups?: { title?: string; items: string[] }[]; items?: string[] }

const POLICY: Section[] = [
  {
    heading: "1. Introduction",
    body: [
      "ICS Aviation Training Institute is committed to protecting the privacy and personal data of all trainees, clients, partners, and website users. This Privacy Policy explains how personal data is collected, used, stored, and protected in accordance with applicable data protection principles and best international practices.",
      "This policy applies to:",
    ],
    items: ["Website users", "Training participants", "Clients and sponsoring organizations", "Instructors and personnel"],
  },
  {
    heading: "2. Data We Collect",
    body: ["ICS may collect and process the following categories of personal data:"],
    groups: [
      { title: "2.1 Personal Identification Data", items: ["Full name", "Email address", "Phone number", "Nationality / ID / passport details (if required for certification)"] },
      { title: "2.2 Training and Performance Data", items: ["Course enrollment details", "Attendance records", "Assessment results and scores", "Certificates and competency records"] },
      { title: "2.3 Organizational Data", items: ["Employer or sponsoring organization", "Job title and role"] },
      { title: "2.4 Technical Data (Website Use)", items: ["IP address", "Browser type and device information", "Website usage data (cookies, analytics)"] },
    ],
  },
  {
    heading: "3. Purpose of Data Processing",
    body: ["Personal data is collected and used for the following purposes:"],
    items: [
      "Delivery and management of training programmes",
      "Issuance and verification of certificates",
      "Monitoring training performance and competency achievement",
      "Compliance with ICAO standards and audit requirements",
      "Reporting to clients or sponsoring organizations",
      "Improving training quality and services",
      "Website functionality and user experience",
    ],
  },
  {
    heading: "4. Legal Basis for Processing",
    body: ["ICS processes personal data based on:"],
    items: [
      "Contractual necessity (training enrollment and delivery)",
      "Legitimate interest (training improvement and operational management)",
      "Compliance with regulatory or audit requirements",
      "Consent (where applicable, such as marketing communications)",
    ],
  },
  {
    heading: "5. Data Sharing and Disclosure",
    body: ["Personal data may be shared with:"],
    items: [
      "Sponsoring organizations or employers (for training reporting)",
      "Regulatory authorities or auditors (e.g., ICAO assessors)",
      "Technology providers (e.g., LMS platforms, cloud storage)",
    ],
  },
  {
    heading: "6. Data Retention",
    body: ["ICS retains data in accordance with operational and regulatory requirements:"],
    items: [
      "Training records: minimum 5 years",
      "Certification records: retained for verification purposes",
      "Website data: retained as per system requirements",
    ],
  },
  {
    heading: "7. Data Security",
    body: ["ICS implements appropriate technical and organizational measures to protect personal data:"],
    items: [
      "Controlled access to systems and records",
      "Secure storage (digital platforms and backups)",
      "Protection against unauthorized access, alteration, or loss",
      "Role-based access control for personnel",
    ],
  },
  {
    heading: "8. User Rights",
    body: ["Individuals may have the right to:"],
    items: [
      "Request access to their personal data",
      "Request correction of inaccurate data",
      "Request deletion (subject to regulatory limitations)",
      "Object to certain processing activities",
    ],
  },
  {
    heading: "9. Cookies and Website Tracking",
    body: ["The ICS website uses cookies to:"],
    items: ["Ensure proper functionality", "Analyze website usage", "Improve user experience"],
  },
  {
    heading: "10. International Data Transfers",
    body: ["Where applicable, data may be processed or stored in systems located outside the user's country. ICS ensures that appropriate safeguards are applied to protect such data."],
  },
  {
    heading: "11. Updates to this Policy",
    body: ["This Privacy Policy may be updated periodically to reflect:"],
    items: ["Changes in legal requirements", "Organizational updates", "Improvements in data protection practices"],
  },
]

const CLOSING: Record<string, string> = {
  "5. Data Sharing and Disclosure": "ICS does not sell or misuse personal data. All third parties are required to maintain confidentiality and data protection standards.",
  "6. Data Retention": "Data is securely archived or deleted after the retention period.",
  "8. User Rights": "Requests can be submitted through official contact channels.",
  "9. Cookies and Website Tracking": "Users may manage cookie preferences through browser settings.",
  "11. Updates to this Policy": "Updated versions will be published on the website.",
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Image src="/logo/logo-dark-blue.png" alt="ICS Aviation" width={140} height={38} className="object-contain" priority />
          <Link href="/lms/login" className="text-sm text-slate-500 hover:text-[#1B4F8A] flex items-center gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold text-slate-900">Privacy Policy</h1>
        <p className="text-sm text-slate-600 mt-2">
          Your privacy is important to us. This policy explains how we handle your personal information.
        </p>
        <p className="text-xs text-slate-400 mt-1">Last updated {LAST_UPDATED}</p>

        <div className="mt-8 space-y-8">
          {POLICY.map(section => (
            <section key={section.heading}>
              <h2 className="text-lg font-semibold text-slate-900">{section.heading}</h2>
              {section.body?.map((p, i) => (
                <p key={i} className="text-sm text-slate-700 leading-relaxed mt-2">{p}</p>
              ))}
              {section.items && (
                <ul className="mt-2 space-y-1.5">
                  {section.items.map(item => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-slate-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1B4F8A]/50 shrink-0 mt-2" />{item}
                    </li>
                  ))}
                </ul>
              )}
              {section.groups?.map(group => (
                <div key={group.title} className="mt-4">
                  {group.title && <h3 className="text-sm font-semibold text-slate-800">{group.title}</h3>}
                  <ul className="mt-1.5 space-y-1.5">
                    {group.items.map(item => (
                      <li key={item} className="flex items-start gap-2.5 text-sm text-slate-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#1B4F8A]/50 shrink-0 mt-2" />{item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {CLOSING[section.heading] && (
                <p className="text-sm text-slate-700 leading-relaxed mt-3">{CLOSING[section.heading]}</p>
              )}
            </section>
          ))}

          <section>
            <h2 className="text-lg font-semibold text-slate-900">12. Contact Information</h2>
            <p className="text-sm text-slate-700 leading-relaxed mt-2">
              For any privacy-related inquiries or requests:
            </p>
            <div className="mt-3 bg-white border border-slate-200 rounded-xl px-5 py-4 text-sm text-slate-700 space-y-1">
              <p className="font-medium text-slate-900">ICS Aviation Training Institute</p>
              <p>Email: <a href="mailto:info@ics-aviation.com" className="text-[#1B4F8A] hover:underline">info@ics-aviation.com</a></p>
              <p>Address: Dubai, UAE</p>
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5 text-xs text-slate-400">
          ICS Aviation Training Institute
        </div>
      </footer>
    </div>
  )
}
