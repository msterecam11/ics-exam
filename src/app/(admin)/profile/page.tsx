"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { useSession, signOut } from "next-auth/react"
import { Loader2, User, Lock, LogOut } from "lucide-react"

export default function ProfilePage() {
  const { data: session, update } = useSession()
  const user = session?.user

  const [name, setName] = useState(user?.name ?? "")
  const [email, setEmail] = useState(user?.email ?? "")
  const [savingInfo, setSavingInfo] = useState(false)

  // Sync input fields once the session is available (session is async on first render)
  useEffect(() => {
    if (user?.name) setName(user.name)
    if (user?.email) setEmail(user.email)
  }, [user?.name, user?.email])

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [savingPassword, setSavingPassword] = useState(false)

  async function handleSaveInfo() {
    if (!name.trim() || !email.trim()) {
      toast.error("Name and email are required")
      return
    }
    setSavingInfo(true)
    const res = await fetch("/api/admin/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    })
    setSavingInfo(false)
    if (!res.ok) {
      const data = await res.json()
      toast.error(data.error ?? "Failed to update profile")
      return
    }
    await update({ name, email })
    toast.success("Profile updated")
  }

  async function handleChangePassword() {
    if (!currentPassword) { toast.error("Enter your current password"); return }
    if (!newPassword) { toast.error("Enter a new password"); return }
    if (newPassword.length < 8) { toast.error("New password must be at least 8 characters"); return }
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match"); return }

    setSavingPassword(true)
    const res = await fetch("/api/admin/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, current_password: currentPassword, new_password: newPassword }),
    })
    setSavingPassword(false)
    if (!res.ok) {
      const data = await res.json()
      toast.error(data.error ?? "Failed to change password")
      return
    }
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    toast.success("Password changed successfully")
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account details and password</p>
      </div>

      {/* Account info */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#1B4F8A] flex items-center justify-center text-white font-bold text-lg">
              {(name || user?.name || "A")[0].toUpperCase()}
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" /> Account Information
              </CardTitle>
              <CardDescription>Update your name and email address</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="capitalize">{user?.role ?? "instructor"}</Badge>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSaveInfo}
              disabled={savingInfo}
              className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white"
            >
              {savingInfo ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4" /> Change Password
          </CardTitle>
          <CardDescription>Leave blank if you don&apos;t want to change your password</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min. 8 characters"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleChangePassword}
              disabled={savingPassword}
              variant="outline"
              className="border-[#1B4F8A] text-[#1B4F8A] hover:bg-blue-50"
            >
              {savingPassword ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Change Password
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sign out */}
      <Card className="border-red-100">
        <CardContent className="pt-5 pb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Sign Out</p>
            <p className="text-xs text-muted-foreground">You will be redirected to the login page</p>
          </div>
          <Button
            variant="outline"
            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 gap-2"
            onClick={() => signOut({ callbackUrl: "/auth/login" })}
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
