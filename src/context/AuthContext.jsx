import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import { isProfileComplete } from '../lib/constants'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null)
      return null
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (error) {
      console.error('Failed to load profile:', error.message)
      setProfile(null)
      return null
    }
    setProfile(data)
    return data
  }, [])

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return
      setUser(session?.user ?? null)
      if (session?.user) await loadProfile(session.user.id)
      if (mounted) setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = useCallback((email, password) => supabase.auth.signInWithPassword({ email, password }), [])

  const signOut = useCallback(() => supabase.auth.signOut(), [])

  /**
   * Send a password-reset email.
   *
   * The redirect must be on the allow-list in Supabase (Authentication → URL
   * Configuration) or the link in the email will not come back to the app.
   */
  const sendPasswordReset = useCallback(
    (email) =>
      supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      }),
    [],
  )

  /** Set a new password for the signed-in (or password-recovery) session. */
  const updatePassword = useCallback((password) => supabase.auth.updateUser({ password }), [])

  /**
   * Update the signed-in user's own profile.
   *
   * Only the fields a person is allowed to change are sent. `role` is never
   * included: the database also rejects role changes from non-admins, so this
   * is defence in depth rather than the only guard.
   */
  const updateOwnProfile = useCallback(
    async ({ first_name, last_name, department, language }) => {
      if (!user) throw new Error('Not signed in')
      const patch = {}
      if (first_name !== undefined) patch.first_name = first_name.trim()
      if (last_name !== undefined) patch.last_name = last_name.trim()
      if (department !== undefined) patch.department = department
      if (language !== undefined) patch.language = language

      const { data, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', user.id)
        .select()
        .single()

      if (error) throw error
      setProfile(data)
      return data
    },
    [user],
  )

  const refreshProfile = useCallback(() => loadProfile(user?.id), [loadProfile, user])

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      isAdmin: profile?.role === 'admin',
      profileComplete: isProfileComplete(profile),
      signIn,
      signOut,
      sendPasswordReset,
      updatePassword,
      updateOwnProfile,
      refreshProfile,
    }),
    [
      user,
      profile,
      loading,
      signIn,
      signOut,
      sendPasswordReset,
      updatePassword,
      updateOwnProfile,
      refreshProfile,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
