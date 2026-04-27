import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
	apiGetAllSheets,
	apiPost,
	getSheetRows,
	isUnauthorizedError,
	pickValue,
} from '../api/api'
import { useAuth } from '../context/AuthContext'

const defaultStages = [
	{
		id: '1',
		nombre: 'Formulario de Postulacion',
		actor: 'Aspirante',
		aprobado: '',
		tiempoMax: '',
		orden: 1,
	},
	{
		id: '2',
		nombre: 'Formulario OAI',
		actor: 'OAI',
		aprobado: '',
		tiempoMax: '',
		orden: 2,
	},
	{
		id: '3',
		nombre: 'Unidad Academica',
		actor: 'Unidad Academica',
		aprobado: '',
		tiempoMax: '',
		orden: 3,
	},
	{
		id: '4',
		nombre: 'Cierre del proceso',
		actor: 'Sistema',
		aprobado: '',
		tiempoMax: '',
		orden: 4,
	},
]

const stageDescriptions = [
	'Envia los documentos listados en el paso 1 a la OAI, con 4 meses de antelacion a la fecha de inicio solicitada.',
	'Revisa que la documentacion se encuentre completa y envia la postulacion a la unidad academica.',
	'Revisa la disponibilidad de cupos y docente en el escenario de practica solicitado.',
	'Consolida las validaciones y deja trazabilidad final de la solicitud.',
]

const parseStage = (row, index) => ({
	id: String(pickValue(row, ['id'], 0) ?? index + 1),
	nombre: String(pickValue(row, ['nombre', 'etapa'], 1) ?? `Etapa ${index + 1}`),
	actor: String(pickValue(row, ['actor'], 2) ?? ''),
	tiempoMax: String(pickValue(row, ['tiempo_max', 'tiempomax'], 3) ?? ''),
	orden: Number(pickValue(row, ['orden', 'order'], 4) ?? index + 1),
})

const parseUsuario = (row, index) => ({
	id: String(pickValue(row, ['id'], 0) ?? index + 1),
	correo: String(pickValue(row, ['correo', 'email'], 1) ?? ''),
	nombres: String(pickValue(row, ['nombres', 'name'], 2) ?? ''),
	apellidos: String(pickValue(row, ['apellidos', 'lastname'], 3) ?? ''),
	rol: String(pickValue(row, ['rol', 'role'], 4) ?? ''),
})

const parseRegistro = (row, index) => ({
	id: String(pickValue(row, ['id'], 0) ?? `REG-${index + 1}`),
	timestamp: String(pickValue(row, ['timestamp', 'fecha'], 1) ?? ''),
	idUsuario: String(pickValue(row, ['id_usuario', 'usuario'], 2) ?? ''),
	idEtapa: String(pickValue(row, ['id_etapa', 'etapa'], 3) ?? ''),
	observacion: String(pickValue(row, ['observacion', 'comentario'], 4) ?? ''),
	aprobado: String(pickValue(row, ['aprobado'], 5) ?? ''),
	urlDocumento: String(pickValue(row, ['url', 'url_documento'], 6) ?? ''),
})

const parseSolicitud = (row, index) => ({
	id: String(pickValue(row, ['id'], 0) ?? index + 1),
	idUsuario: String(pickValue(row, ['id_usuario', 'usuario'], 1) ?? ''),
	etapaActual: String(pickValue(row, ['etapa_actual', 'etapa'], 2) ?? ''),
	fecha: String(pickValue(row, ['fecha'], 3) ?? ''),
})

const idToNumber = (value) => {
	const matches = String(value ?? '').match(/\d+/g)
	if (!matches || matches.length === 0) return 0
	const candidate = Number(matches[matches.length - 1])
	return Number.isFinite(candidate) ? candidate : 0
}

const getNextId = (rows) => {
	const maxId = rows.reduce((max, row) => {
		const rowId = pickValue(row, ['id'], 0)
		return Math.max(max, idToNumber(rowId))
	}, 0)

	return String(maxId + 1)
}

const findUserByEmail = (rows, email) => {
	const emailTarget = String(email ?? '').trim().toLowerCase()
	if (!emailTarget) return null

	const row = rows.find((candidate) => {
		const rowEmail = String(
			pickValue(candidate, ['correo', 'email'], 1) ?? '',
		).toLowerCase()
		return rowEmail === emailTarget
	})

	return row ? parseUsuario(row, 0) : null
}

const splitUserName = (fullName) => {
	const tokens = String(fullName ?? '')
		.trim()
		.split(/\s+/)
		.filter(Boolean)

	if (tokens.length === 0) {
		return { nombres: '', apellidos: '' }
	}

	if (tokens.length === 1) {
		return { nombres: tokens[0], apellidos: '' }
	}

	const [firstName, ...lastNameParts] = tokens
	return { nombres: firstName, apellidos: lastNameParts.join(' ') }
}

const mergeStages = (sheetRows) => {
	const parsedStages = sheetRows.map(parseStage)
	const merged = defaultStages.map((stage) => ({ ...stage }))

	parsedStages.forEach((sheetStage, index) => {
		const existingIndex = merged.findIndex(
			(stage) => Number(stage.orden) === Number(sheetStage.orden),
		)

		if (existingIndex >= 0) {
			merged[existingIndex] = {
				...merged[existingIndex],
				...sheetStage,
			}
			return
		}

		if (index === 0) {
			merged[0] = {
				...merged[0],
				...sheetStage,
			}
		}
	})

	return merged
}

const formatRequestDate = (timestamp) => {
	const date = new Date(timestamp)
	if (Number.isNaN(date.getTime())) return timestamp || '-'
	return date.toLocaleDateString('es-CO')
}

const UserPage = () => {
	const navigate = useNavigate()
	const { auth, logout, updateAuthUser } = useAuth()
	const [stages, setStages] = useState(defaultStages)
	const [myRequests, setMyRequests] = useState([])
	const [firstStageRequest, setFirstStageRequest] = useState(null)
	const [userSheet, setUserSheet] = useState(null)
	const [solicitudActual, setSolicitudActual] = useState(null)
	const [loading, setLoading] = useState(true)
	const [formLoading, setFormLoading] = useState(false)
	const [error, setError] = useState('')
	const [formMessage, setFormMessage] = useState('')
	const [formData, setFormData] = useState({ observacion: '', urlDocumento: '' })

	const firstStageOrder = useMemo(() => stages[0]?.orden ?? 1, [stages])

	const hydrateFromSheets = useCallback(
		(sheetMap) => {
			const stageRows = getSheetRows(sheetMap, 'CONVENIOS_ETAPAS', [
				'convenios_etapas',
				'etapas',
			])
			const mergedStages = mergeStages(stageRows)
			setStages(mergedStages)

			const usersRows = getSheetRows(sheetMap, 'USUARIOS', ['usuarios'])
			const foundUser = findUserByEmail(usersRows, auth.user?.email)
			setUserSheet(foundUser)

			if (foundUser) {
				updateAuthUser({
					id: foundUser.id,
					rol: String(foundUser.rol ?? '').trim().toLowerCase(),
				})
			}

			const registrosRows = getSheetRows(sheetMap, 'REGISTROS', ['registros'])
			const solicitudesRows = getSheetRows(sheetMap, 'SOLICITUDES', ['solicitudes'])
			const parsedRegistros = registrosRows.map(parseRegistro)
			const parsedSolicitudes = solicitudesRows.map(parseSolicitud)
			const ownRegistros = foundUser
				? parsedRegistros.filter(
						(registro) => String(registro.idUsuario) === String(foundUser.id),
					)
				: []

			ownRegistros.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
			setMyRequests(ownRegistros)

			const currentFirstStageId = String(mergedStages[0]?.orden ?? 1)
			const latestFirstStageRequest = ownRegistros.find(
				(request) => String(request.idEtapa) === String(currentFirstStageId),
			)
			setFirstStageRequest(latestFirstStageRequest ?? null)

			const userSolicitud = foundUser
				? parsedSolicitudes
						.filter(
							(solicitud) => String(solicitud.idUsuario) === String(foundUser.id),
						)
						.sort((a, b) => idToNumber(b.id) - idToNumber(a.id))[0]
				: null

			setSolicitudActual(userSolicitud ?? null)
		},
		[auth.user?.email, updateAuthUser],
	)

	const loadUserData = useCallback(async () => {
		setLoading(true)
		setError('')

		try {
			const sheetMap = await apiGetAllSheets(auth.token)
			hydrateFromSheets(sheetMap)
		} catch (loadError) {
			if (isUnauthorizedError(loadError)) {
				logout()
				navigate('/login', { replace: true })
				return
			}

			setStages(defaultStages)
			setMyRequests([])
			setFirstStageRequest(null)
			setError('No se pudieron cargar tus solicitudes. Intenta nuevamente.')
		}

		setLoading(false)
	}, [auth.token, hydrateFromSheets, logout, navigate])

	useEffect(() => {
		let active = true

		const run = async () => {
			await Promise.resolve()
			if (active) {
				await loadUserData()
			}
		}

		run()

		return () => {
			active = false
		}
	}, [loadUserData])

	const handleChange = (event) => {
		const { name, value } = event.target
		setFormData((prev) => ({ ...prev, [name]: value }))
	}

	const handleSubmit = async (event) => {
		event.preventDefault()

		const cleanObservation = formData.observacion.trim()
		if (!cleanObservation) {
			setFormMessage('Debes escribir una observacion para crear la solicitud.')
			return
		}

		const cleanUrl = formData.urlDocumento.trim()

		setFormLoading(true)
		setFormMessage('')

		try {
			const sheetMap = await apiGetAllSheets(auth.token)
			const usersRows = getSheetRows(sheetMap, 'USUARIOS', ['usuarios'])
			const registrosRows = getSheetRows(sheetMap, 'REGISTROS', ['registros'])
			const solicitudesRows = getSheetRows(sheetMap, 'SOLICITUDES', ['solicitudes'])

			let currentUser = findUserByEmail(usersRows, auth.user?.email)

			if (!currentUser) {
				const nextUserId = getNextId(usersRows)
				const { nombres, apellidos } = splitUserName(auth.user?.name)

				await apiPost(
					'/api/sheets/USUARIOS/rows',
					{
						values: [nextUserId, '', nombres, apellidos, ''],
						userEmailColumnIndex: 1,
					},
					auth.token,
				)

				currentUser = {
					id: nextUserId,
					correo: auth.user?.email ?? '',
					nombres,
					apellidos,
					rol: '',
				}

				setUserSheet(currentUser)
				updateAuthUser({
					id: nextUserId,
					rol: '',
				})
			}

			const nextRegistroId = getNextId(registrosRows)
			const nextSolicitudId = getNextId(solicitudesRows)
			const currentTimestamp = new Date().toISOString()
			const currentDate = currentTimestamp.slice(0, 10)

			await apiPost(
				'/api/sheets/SOLICITUDES/rows',
				{
					values: [
						nextSolicitudId,
						String(currentUser.id),
						String(firstStageOrder),
						currentDate,
					],
				},
				auth.token,
			)

			await apiPost(
				'/api/sheets/REGISTROS/rows',
				{
					values: [
						nextRegistroId,
						currentTimestamp,
						String(currentUser.id),
						String(firstStageOrder),
						cleanObservation,
						false,
						cleanUrl,
					],
				},
				auth.token,
			)

			const refreshSheetMap = await apiGetAllSheets(auth.token)
			hydrateFromSheets(refreshSheetMap)
			setFormData({ observacion: '', urlDocumento: '' })
			setFormMessage('Registro enviado correctamente en el primer paso.')
		} catch (submitError) {
			if (isUnauthorizedError(submitError)) {
				logout()
				navigate('/login', { replace: true })
				return
			}

			const message =
				submitError?.response?.data?.message ||
				'No se pudo guardar la solicitud en el backend.'
			setFormMessage(message)
		} finally {
			setFormLoading(false)
		}
	}

	return (
		<section className="user-page">
			<div className="page-intro">
				<h2>Ruta de Solicitud</h2>
				<p>
					Solo el primer paso se encuentra habilitado por ahora. Los siguientes
					pasos apareceran en gris hasta que sean activados en el proceso.
				</p>
			</div>

			{error ? <p className="message error">{error}</p> : null}

			{loading ? (
				<div className="page-state">
					<p>Cargando informacion de tu proceso...</p>
				</div>
			) : (
				<div className="timeline">
					{stages.map((stage, index) => {
						const enabled = index === 0
						const sideClass = index % 2 === 0 ? 'left' : 'right'

						return (
							<article
								key={`${stage.id}-${index}`}
								className={`timeline-item ${sideClass} ${enabled ? 'enabled' : 'disabled'}`}
							>
								<div className="timeline-node">{index + 1}</div>

								<div className="timeline-card">
									<h3>{stage.nombre}</h3>
									<p>{stageDescriptions[index] ?? 'Etapa del proceso de solicitud.'}</p>

									<p className="timeline-meta">
										Actor: <strong>{stage.actor || 'Sin definir'}</strong>
									</p>
									{stage.tiempoMax ? (
										<p className="timeline-meta">
											Tiempo maximo: <strong>{stage.tiempoMax} dias</strong>
										</p>
									) : null}

									{enabled && !firstStageRequest ? (
										<form className="request-form" onSubmit={handleSubmit}>
											<label htmlFor="observacion">Observacion de postulacion</label>
											<textarea
												id="observacion"
												name="observacion"
												placeholder="Escribe un resumen de tu solicitud"
												value={formData.observacion}
												onChange={handleChange}
												rows={4}
												required
											/>

											<label htmlFor="urlDocumento">URL del documento</label>
											<input
												id="urlDocumento"
												name="urlDocumento"
												type="url"
												placeholder="https://ejemplo.com/mi-documento"
												value={formData.urlDocumento}
												onChange={handleChange}
											/>

											<button type="submit" disabled={formLoading}>
												{formLoading ? 'Guardando...' : 'Enviar solicitud'}
											</button>
										</form>
									) : enabled && firstStageRequest ? (
										<div className="request-summary">
											<p>
												<strong>Solicitud creada:</strong>{' '}
												{formatRequestDate(firstStageRequest.timestamp)}
											</p>
											<p>
												<strong>Observacion:</strong>{' '}
												{firstStageRequest.observacion || '-'}
											</p>
											<p>
												<strong>Aprobado:</strong>{' '}
												{String(firstStageRequest.aprobado).toLowerCase() === 'true'
													? 'Si'
													: 'No'}
											</p>
											{firstStageRequest.urlDocumento ? (
												<p>
													<a
														href={firstStageRequest.urlDocumento}
														target="_blank"
														rel="noreferrer"
													>
														Ver documento enviado
													</a>
												</p>
											) : null}
										</div>
									) : (
										<p className="disabled-note">
											Este paso estara disponible cuando avance tu solicitud.
										</p>
									)}
								</div>
							</article>
						)
					})}
				</div>
			)}

			<section className="my-requests">
				<h3>Mis Registros</h3>
				{userSheet ? (
					<p className="timeline-meta">ID de usuario: {userSheet.id}</p>
				) : (
					<p className="timeline-meta">
						Aun no estas registrado en USUARIOS. Se creara el usuario cuando envies la primera solicitud.
					</p>
				)}

				{myRequests.length === 0 ? (
					<p className="empty-state">Aun no tienes registros en el proceso.</p>
				) : (
					<div className="request-list">
						{myRequests.map((request) => (
							<article className="request-item" key={request.id}>
								<span className="request-id">{request.idSolicitud || request.id}</span>
								<span>Etapa: {request.idEtapa || '-'}</span>
								<span>Fecha: {request.timestamp || '-'}</span>
								{request.urlDocumento ? (
									<a href={request.urlDocumento} target="_blank" rel="noreferrer">
										Ver documento
									</a>
								) : null}
							</article>
						))}
					</div>
				)}
			</section>

			{formMessage ? <p className="message info">{formMessage}</p> : null}
		</section>
	)
}

export default UserPage
