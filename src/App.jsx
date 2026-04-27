import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import Header from './components/Header'
import { isAdminRole, useAuth } from './context/AuthContext'
import AdminDashboard from './pages/AdminDashboard'
import GoogleLoginPage from './pages/GoogleLogin'
import UserPage from './pages/UserPage'
import ProtectedRoute from './routes/ProtectedRoute'

function App() {
  const { auth, logout } = useAuth()

  const getDefaultRoute = () => {
    if (!auth.token) return '/login'
    return isAdminRole(auth.role) ? '/admin' : '/usuario'
  }

  return (
    <BrowserRouter>
      <div className="app-shell">
        <Header user={auth.user} onLogout={logout} />

        <main className="app-main">
          <Routes>
            <Route path="/" element={<Navigate to={getDefaultRoute()} replace />} />
            <Route
              path="/login"
              element={
                auth.token ? (
                  <Navigate to={getDefaultRoute()} replace />
                ) : (
                  <GoogleLoginPage />
                )
              }
            />
            <Route
              path="/usuario"
              element={
                <ProtectedRoute>
                  <UserPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute roles={['admin']}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to={getDefaultRoute()} replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
