import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
	apiGetAllSheets,
	getSheetRows,
	isUnauthorizedError,
	pickValue,
} from '../api/api'
import { useAuth } from '../context/AuthContext'

const defaultStages = [
	{ id: '1', nombre: 'Formulario de Postulacion' },
	{ id: '2', nombre: 'Formulario OAI' },
	{ id: '3', nombre: 'Unidad Academica' },
	{ id: '4', nombre: 'Cierre del proceso' },
]

const parseStage = (row, index) => ({
	id: String(pickValue(row, ['id', 'id_etapa'], 0) ?? index + 1),
	nombre: String(pickValue(row, ['nombre', 'etapa'], 1) ?? `Etapa ${index + 1}`),
})

const parseRegistro = (row, index) => ({
	id: String(pickValue(row, ['id'], 0) ?? `REG-${index + 1}`),
	timestamp: String(pickValue(row, ['timestamp', 'fecha'], 1) ?? ''),
	idUsuario: String(pickValue(row, ['id_usuario', 'usuario', 'correo'], 2) ?? ''),
	idEtapa: String(pickValue(row, ['id_etapa', 'etapa'], 3) ?? ''),
	idSolicitud: String(pickValue(row, ['id_solicitud', 'solicitud'], 4) ?? ''),
	observacion: String(pickValue(row, ['observacion', 'comentario'], 5) ?? ''),
	aprobado: String(pickValue(row, ['aprobado'], 6) ?? ''),
})

const parseSolicitud = (row, index) => ({
	id: String(pickValue(row, ['id', 'id_solicitud'], 0) ?? `SOL-${index + 1}`),
	idUsuario: String(pickValue(row, ['id_usuario', 'usuario'], 1) ?? ''),
	idEtapaActual: String(
		pickValue(row, ['id_etapa_actual', 'id_etapa', 'etapa'], 2) ?? '1',
	),
})

const parseUsuario = (row, index) => {
	const names = String(pickValue(row, ['nombres', 'name'], 2) ?? '').trim()
	const lastNames = String(pickValue(row, ['apellidos', 'lastname'], 3) ?? '').trim()
	const fullName = [names, lastNames].filter(Boolean).join(' ').trim()

	return {
		id: String(pickValue(row, ['id'], 0) ?? index + 1),
		correo: String(pickValue(row, ['correo', 'email'], 1) ?? ''),
		nombreCompleto: fullName,
	}
}

const AdminDashboard = () => {
	const navigate = useNavigate()
	const { auth, logout } = useAuth()
	const [groups, setGroups] = useState([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')

	const loadDashboard = useCallback(async () => {
		setLoading(true)
		setError('')

		try {
			const sheetMap = await apiGetAllSheets(auth.token)
			const steps = getSheetRows(sheetMap, 'CONVENIOS_ETAPAS', [
				'convenios_etapas',
				'etapas',
			]).map(parseStage)
			const registros = getSheetRows(sheetMap, 'REGISTROS', ['registros']).map(
				parseRegistro,
			)
			const solicitudes = getSheetRows(sheetMap, 'SOLICITUDES', [
				'solicitudes',
			]).map(parseSolicitud)
			const usuarios = getSheetRows(sheetMap, 'USUARIOS', ['usuarios']).map(
				parseUsuario,
			)

			const usersByKey = new Map()
			usuarios.forEach((user) => {
				const label = user.nombreCompleto || user.correo || `Usuario ${user.id}`
				usersByKey.set(user.id, label)
				usersByKey.set(user.correo.toLowerCase(), label)
			})

			const grouped = (steps.length > 0 ? steps : defaultStages).map((stage) => ({
				...stage,
				items: [],
			}))

			const stageIndexById = new Map(
				grouped.map((stage, index) => [stage.id, index]),
			)

			registros.forEach((registro) => {
				const targetIndex = stageIndexById.get(registro.idEtapa)
				if (targetIndex === undefined) return

				grouped[targetIndex].items.push({
					type: 'registro',
					id: registro.id,
					timestamp: registro.timestamp,
					userLabel:
						usersByKey.get(registro.idUsuario) ||
						usersByKey.get(registro.idUsuario.toLowerCase()) ||
						registro.idUsuario ||
						'Sin usuario',
					idSolicitud: registro.idSolicitud,
					observacion: registro.observacion,
					aprobado: registro.aprobado,
				})
			})

			solicitudes.forEach((solicitud) => {
				const targetIndex = stageIndexById.get(solicitud.idEtapaActual)
				if (targetIndex === undefined) return

				const alreadyTracked = grouped[targetIndex].items.some(
					(item) => item.idSolicitud === solicitud.id,
				)

				if (!alreadyTracked) {
					grouped[targetIndex].items.push({
						type: 'solicitud',
						id: `S-${solicitud.id}`,
						timestamp: '',
						userLabel:
							usersByKey.get(solicitud.idUsuario) ||
							usersByKey.get(solicitud.idUsuario.toLowerCase()) ||
							solicitud.idUsuario ||
							'Sin usuario',
						idSolicitud: solicitud.id,
						observacion: 'Sin registro asociado en la etapa actual.',
						aprobado: '',
					})
				}
			})

			grouped.forEach((group) => {
				group.items.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
			})

			setGroups(grouped)
		} catch (loadError) {
			if (isUnauthorizedError(loadError)) {
				logout()
				navigate('/login', { replace: true })
				return
			}

			setGroups((defaultStages || []).map((stage) => ({ ...stage, items: [] })))
			setError('No se pudo cargar la informacion del dashboard.')
		}

		setLoading(false)
	}, [auth.token, logout, navigate])

	useEffect(() => {
		let active = true

		const run = async () => {
			await Promise.resolve()
			if (active) {
				await loadDashboard()
			}
		}

		run()

		return () => {
			active = false
		}
	}, [loadDashboard])

	const totalRequests = useMemo(
		() => groups.reduce((acc, group) => acc + group.items.length, 0),
		[groups],
	)

	return (
		<section className="admin-page">
			<div className="page-intro">
				<h2>Dashboard Administrativo</h2>
				<p>
					Visualiza las solicitudes por etapa en desplegables, con timestamp y
					usuario que registro el movimiento.
				</p>
			</div>

			<div className="admin-kpis">
				<article>
					<span>Total etapas</span>
					<strong>{groups.length}</strong>
				</article>
				<article>
					<span>Total solicitudes</span>
					<strong>{totalRequests}</strong>
				</article>
			</div>

			{error ? <p className="message error">{error}</p> : null}

			{loading ? (
				<div className="page-state">
					<p>Cargando dashboard...</p>
				</div>
			) : (
				<div className="admin-groups">
					{groups.map((group, index) => (
						<details key={group.id} className="admin-group" open={index === 0}>
							<summary>
								<span>{group.nombre}</span>
								<span className="badge-count">{group.items.length} registros</span>
							</summary>

							<div className="admin-items">
								{group.items.length === 0 ? (
									<p className="empty-state">No hay solicitudes en esta etapa.</p>
								) : (
									group.items.map((item) => (
										<article key={item.id} className="admin-item-card">
											<div className="admin-item-head">
												<strong>{item.id || 'Sin solicitud'}</strong>
												<span>{item.timestamp || 'Sin timestamp'}</span>
											</div>

											<p>Usuario: {item.userLabel}</p>
											<p>Observacion: {item.observacion || 'Sin observacion'}</p>
											<p>
												Aprobado:{' '}
												{item.aprobado ? String(item.aprobado) : 'Sin definir'}
											</p>
										</article>
									))
								)}
							</div>
						</details>
					))}
				</div>
			)}
		</section>
	)
}

export default AdminDashboard
