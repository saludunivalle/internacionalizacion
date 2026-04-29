import logoUnivalle from '../assets/logounivalle.svg'

const Header = ({ user, onLogout }) => {
	const roleLabel = String(user?.rol ?? '').trim()
	const subtitle = user
		? roleLabel
			? `${user.name ?? 'Usuario'} - ${roleLabel}`
			: `${user.name ?? 'Usuario'}`
		: ''

	return (
		<header className="app-header">
			<div className="header-brand">
				<img src={logoUnivalle} alt="Universidad del Valle" className="header-logo" />
			</div>

			<div className="header-center">
				<h1 className="header-title">Procesos de Convenios - OAI</h1>
				{subtitle ? <p className="header-subtitle">{subtitle}</p> : null}
			</div>

			<div className="header-session">
				{user ? (
					<>
						<button type="button" className="logout-btn" onClick={onLogout}>
							Salir
						</button>
					</>
				) : null}
			</div>
		</header>
	)
}

export default Header
