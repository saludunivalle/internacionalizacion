/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { decodeToken } from 'react-jwt'
import { apiGetAllSheets, apiPublic, getSheetRows, pickValue } from '../api/api'

const SESSION_KEY = 'internacionalizacion_auth_session'
const ADMIN_ROLES = new Set(['admin', 'administrador', 'sistemas'])

const normalizeRole = (role) => {
  if (role === null || role === undefined) return ''
  return String(role).trim().toLowerCase()
}

export const isAdminRole = (role) => ADMIN_ROLES.has(normalizeRole(role))

const tokenLooksExpired = (token) => {
  if (!token) return true
  try {
    const decoded = decodeToken(token)
    if (!decoded || typeof decoded !== 'object') return false
    if (!decoded.exp) return false
    return Number(decoded.exp) * 1000 <= Date.now()
  } catch {
    return false
  }
}

const readStoredSession = () => {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return { token: null, user: null, role: '' }

    const parsed = JSON.parse(raw)
    if (!parsed?.token || tokenLooksExpired(parsed.token)) {
      localStorage.removeItem(SESSION_KEY)
      return { token: null, user: null, role: '' }
    }

    return {
      token: parsed.token,
      user: parsed.user ?? null,
      role: normalizeRole(parsed.role ?? parsed.user?.rol ?? parsed.user?.role),
    }
  } catch {
    return { token: null, user: null, role: '' }
  }
}

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [auth, setAuth] = useState(readStoredSession)
  const [loading, setLoading] = useState(false)

  const persistAuth = useCallback((nextAuth) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(nextAuth))
    setAuth(nextAuth)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    setAuth({ token: null, user: null, role: '' })
  }, [])

  const resolveRoleFromUsersSheet = useCallback(async (email, token) => {
    const sheetMap = await apiGetAllSheets(token)
    const rows = getSheetRows(sheetMap, 'USUARIOS', ['usuarios', 'users'])

    const matchedUser = rows.find((row) => {
      const rowEmail = pickValue(row, ['correo', 'email'], 1)
      return String(rowEmail ?? '').toLowerCase() === String(email ?? '').toLowerCase()
    })

    if (!matchedUser) {
      return {
        userId: null,
        role: '',
        names: null,
        lastNames: null,
      }
    }

    return {
      userId: pickValue(matchedUser, ['id'], 0) ?? null,
      role: normalizeRole(pickValue(matchedUser, ['rol', 'role'], 4)),
      names: pickValue(matchedUser, ['nombres', 'name'], 2) ?? null,
      lastNames: pickValue(matchedUser, ['apellidos', 'lastname'], 3) ?? null,
    }
  }, [])

  const loginWithGoogleCredential = useCallback(
    async (credential) => {
      setLoading(true)
      try {
        const { data } = await apiPublic.post('/api/auth/google', { credential })

        const token = data?.token ?? data?.data?.token
        if (!token) {
          throw new Error('El backend no devolvio token de sesion.')
        }

        const backendUser = data?.user ?? data?.data?.user ?? {}
        const backendEmail =
          backendUser.email ?? backendUser.correo ?? backendUser.mail ?? null

        let role = ''

        let names = null
        let lastNames = null
        let userId = null

        if (backendEmail) {
          try {
            const roleInfo = await resolveRoleFromUsersSheet(backendEmail, token)
            role = roleInfo.role || role
            names = roleInfo.names
            lastNames = roleInfo.lastNames
            userId = roleInfo.userId
          } catch {
            role = normalizeRole(role)
          }
        }

        role = normalizeRole(role)

        const mergedName = [names, lastNames].filter(Boolean).join(' ').trim()

        const user = {
          id: userId,
          email: backendEmail,
          name: mergedName || backendUser.name || backendUser.nombre || backendEmail,
          picture: backendUser.picture ?? backendUser.foto ?? null,
          rol: role,
        }

        const nextAuth = { token, user, role }
        persistAuth(nextAuth)

        return nextAuth
      } finally {
        setLoading(false)
      }
    },
    [persistAuth, resolveRoleFromUsersSheet],
  )

  const updateAuthUser = useCallback(
    (patch) => {
      setAuth((prev) => {
        if (!prev?.token) return prev

        const currentUser = prev.user ?? {}
        const nextUser =
          typeof patch === 'function' ? patch(currentUser) : { ...currentUser, ...patch }

        const nextRole = normalizeRole(nextUser?.rol ?? prev.role)
        const nextAuth = {
          ...prev,
          role: nextRole,
          user: {
            ...nextUser,
            rol: nextRole,
          },
        }

        localStorage.setItem(SESSION_KEY, JSON.stringify(nextAuth))
        return nextAuth
      })
    },
    [],
  )

  const value = useMemo(
    () => ({
      auth,
      loading,
      loginWithGoogleCredential,
      logout,
      updateAuthUser,
      isAdmin: isAdminRole(auth.role),
    }),
    [auth, loading, loginWithGoogleCredential, logout, updateAuthUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider.')
  }
  return context
}