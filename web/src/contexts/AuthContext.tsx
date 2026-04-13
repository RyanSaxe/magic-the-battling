import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { authGetMe, authLogin, authLogout, authRegister } from '../api/client'
import { AuthContext } from './authState'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ user_id: string; username: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    authGetMe().then((u) => {
      setUser(u)
      setLoading(false)
    })
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const u = await authLogin(username, password)
    setUser(u)
  }, [])

  const register = useCallback(async (username: string, password: string, email?: string) => {
    const u = await authRegister(username, password, email)
    setUser(u)
  }, [])

  const logout = useCallback(async () => {
    await authLogout()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
