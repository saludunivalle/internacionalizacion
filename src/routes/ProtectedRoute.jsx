import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { isAdminRole, useAuth } from '../context/AuthContext'

const ProtectedRoute = ({ roles, children }) => {
  const { auth, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="page-state">
        <p>Validando sesion...</p>
      </div>
    )
  }

  if (!auth.token) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (roles?.length) {
    const userRole = String(auth.role ?? '').toLowerCase()
    const hasAccess = roles.some((role) => {
      const normalizedRole = String(role).toLowerCase()
      if (normalizedRole === 'admin') return isAdminRole(userRole)
      return normalizedRole === userRole
    })

    if (!hasAccess) {
      return <Navigate to="/usuario" replace />
    }
  }

  return children ?? <Outlet />
}

export default ProtectedRoute