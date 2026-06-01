import logoMapa from "../assets/OAI_MAPA.png";

const Header = ({ user, onLogout }) => {
  const roleLabel = String(user?.rol ?? "").trim();
  const subtitle = user
    ? roleLabel
      ? `${user.name ?? "Usuario"} - ${roleLabel}`
      : `${user.name ?? "Usuario"}`
    : "";

  return (
    <header className="app-header">
      <div className="header-brand">
        <img src={logoMapa} alt="OAI mapa" className="header-logo" />
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
  );
};

export default Header;
