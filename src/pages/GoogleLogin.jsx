import { useState } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { useNavigate } from 'react-router-dom'
import { isAdminRole, useAuth } from '../context/AuthContext'

const GoogleLoginPage = () => {
	const navigate = useNavigate()
	const { loginWithGoogleCredential, loading } = useAuth()
	const [error, setError] = useState('')

	const handleSuccess = async (response) => {
		try {
			setError('')
			if (!response?.credential) {
				throw new Error('Google no devolvio credenciales validas.')
			}

			const session = await loginWithGoogleCredential(response.credential)
			const targetRoute = isAdminRole(session.role) ? '/admin' : '/usuario'
			navigate(targetRoute, { replace: true })
		} catch (loginError) {
			const message =
				loginError?.response?.data?.message ||
				loginError?.message ||
				'No se pudo iniciar sesion con Google.'
			setError(message)
		}
	}

	const handleError = () => {
		setError('La autenticacion con Google fue cancelada o fallo.')
	}

	return (
		<section className="login-page">
			<div className="login-card">
				<h2>Ingreso a la plataforma</h2>
				<p>
					Usa exclusivamente tu cuenta institucional de Google para entrar al
					proceso de movilidad.
				</p>

				<div className="google-button-wrap">
					<GoogleLogin onSuccess={handleSuccess} onError={handleError} />
				</div>

				{loading ? <p className="message info">Validando usuario...</p> : null}
				{error ? <p className="message error">{error}</p> : null}
			</div>
		</section>
	)
}

export default GoogleLoginPage
