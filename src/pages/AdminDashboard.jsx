import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
	apiGetAllSheets,
	apiPatch,
	getSheetRows,
	isUnauthorizedError,
	pickValue,
} from '../api/api'
import { useAuth } from '../context/AuthContext'

const parseProceso = (row, index) => ({
	id: String(pickValue(row, ['id'], 0) ?? index + 1),
	nombre: String(pickValue(row, ['nombre'], 1) ?? `Proceso ${index + 1}`),
})

const parseActividad = (row, index) => ({
	id: String(pickValue(row, ['id'], 0) ?? index + 1),
	idProceso: String(pickValue(row, ['id_proceso', 'proceso'], 1) ?? ''),
	idAdjunto: String(pickValue(row, ['id_adjunto', 'adjunto'], 2) ?? ''),
	nombre: String(
		pickValue(row, ['nombre', 'actividad'], 3) ?? `Actividad ${index + 1}`,
	),
	tiempoMax: String(pickValue(row, ['tiempo_max', 'tiempomax'], 4) ?? ''),
	orden: Number(pickValue(row, ['orden', 'order'], 5) ?? index + 1),
})

const parseAdjunto = (row, index) => ({
	id: String(pickValue(row, ['id'], 0) ?? index + 1),
	idActividad: String(pickValue(row, ['id_actividad', 'actividad'], 1) ?? ''),
	nombre: String(pickValue(row, ['nombre'], 2) ?? `Adjunto ${index + 1}`),
})

const parseActor = (row, index) => ({
	id: String(pickValue(row, ['id'], 0) ?? index + 1),
	idActividad: String(pickValue(row, ['id_actividad', 'actividad'], 1) ?? ''),
	nombre: String(pickValue(row, ['nombre', 'actor'], 2) ?? `Actor ${index + 1}`),
})

const parseRegistro = (row, index) => ({
	id: String(pickValue(row, ['id'], 0) ?? `REG-${index + 1}`),
	idUsuario: String(pickValue(row, ['id_usuario', 'usuario'], 1) ?? ''),
	idActividad: String(pickValue(row, ['id_actividad', 'actividad'], 2) ?? ''),
	idSolicitud: String(pickValue(row, ['id_solicitud', 'solicitud'], 3) ?? ''),
	timestamp: String(pickValue(row, ['timestamp', 'fecha'], 4) ?? ''),
	observacion: String(pickValue(row, ['observacion', 'comentario'], 5) ?? ''),
	aprobado: String(pickValue(row, ['aprobado'], 6) ?? ''),
	url: String(pickValue(row, ['url', 'url_documento'], 7) ?? ''),
})

const parseSolicitud = (row, index) => ({
	id: String(pickValue(row, ['id'], 0) ?? `SOL-${index + 1}`),
	idUsuario: String(pickValue(row, ['id_usuario', 'usuario'], 1) ?? ''),
	idProceso: String(pickValue(row, ['id_proceso', 'proceso'], 2) ?? ''),
	actividadActual: String(
		pickValue(row, ['actividad_actual', 'actividad'], 3) ?? '',
	),
	fecha: String(pickValue(row, ['fecha'], 4) ?? ''),
})

const parseUsuario = (row, index) => {
	const names = String(pickValue(row, ['nombres', 'name'], 2) ?? '').trim()
	const lastNames = String(
		pickValue(row, ['apellidos', 'lastname'], 3) ?? '',
	).trim()
	const fullName = [names, lastNames].filter(Boolean).join(' ').trim()

	return {
		id: String(pickValue(row, ['id'], 0) ?? index + 1),
		correo: String(pickValue(row, ['correo', 'email'], 1) ?? ''),
		nombreCompleto: fullName,
		rol: String(pickValue(row, ['rol', 'role'], 4) ?? ''),
	}
}

const idToNumber = (value) => {
	const matches = String(value ?? '').match(/\d+/g)
	if (!matches || matches.length === 0) return 0
	const candidate = Number(matches[matches.length - 1])
	return Number.isFinite(candidate) ? candidate : 0
}

const formatDate = (timestamp) => {
	const date = new Date(timestamp)
	if (Number.isNaN(date.getTime())) return timestamp || '-'
	return date.toLocaleDateString('es-CO')
}

const resolveActivity = (activities, activityRef) => {
	if (!activities || activities.length === 0) return null
	const ref = String(activityRef ?? '')
	if (!ref) return null
	const direct = activities.find((activity) => String(activity.id) === ref)
	if (direct) return direct
	const refNumber = Number(ref)
	if (!Number.isFinite(refNumber)) return null
	return (
		activities.find((activity) => Number(activity.orden) === refNumber) ?? null
	)
}

const matchesActivity = (activityRef, activity) => {
	const ref = String(activityRef ?? '')
	if (!ref) return false
	return ref === String(activity.id) || ref === String(activity.orden)
}

const AdminDashboard = () => {
	const navigate = useNavigate()
	const { auth, logout } = useAuth()
	const [processes, setProcesses] = useState([])
	const [activities, setActivities] = useState([])
	const [activityActors, setActivityActors] = useState([])
	const [activityAttachments, setActivityAttachments] = useState([])
	const [solicitudes, setSolicitudes] = useState([])
	const [records, setRecords] = useState([])
	const [selectedRecord, setSelectedRecord] = useState(null)
	const [selectedFlow, setSelectedFlow] = useState([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')

	const activitiesByProcess = useMemo(() => {
		const map = new Map()
		activities.forEach((activity) => {
			const key = String(activity.idProceso ?? '')
			if (!map.has(key)) {
				map.set(key, [])
			}
			map.get(key).push(activity)
		})
		map.forEach((list) => {
			list.sort((a, b) => Number(a.orden) - Number(b.orden))
		})
		return map
	}, [activities])

	const actorsByActivity = useMemo(() => {
		const map = new Map()
		activityActors.forEach((actor) => {
			const key = String(actor.idActividad ?? '')
			if (!map.has(key)) {
				map.set(key, [])
			}
			map.get(key).push(actor)
		})
		return map
	}, [activityActors])

	const attachmentsByActivity = useMemo(() => {
		const map = new Map()
		activityAttachments.forEach((adjunto) => {
			const key = String(adjunto.idActividad ?? '')
			if (!map.has(key)) {
				map.set(key, [])
			}
			map.get(key).push(adjunto)
		})
		return map
	}, [activityAttachments])

	const hydrateDashboard = useCallback((sheetMap) => {
		const procesosRows = getSheetRows(sheetMap, 'PROCESOS', ['procesos'])
		const actividadesRows = getSheetRows(sheetMap, 'ACTIVIDADES', ['actividades'])
		const adjuntosRows = getSheetRows(sheetMap, 'ADJUNTOS_ACTIVIDADES', [
			'adjuntos_actividades',
			'adjuntos',
		])
		const actoresRows = getSheetRows(sheetMap, 'ACTIVIDAD_ACTOR', [
			'actividad_actor',
			'actores',
		])
		const registrosRows = getSheetRows(sheetMap, 'REGISTROS', ['registros'])
		const solicitudesRows = getSheetRows(sheetMap, 'SOLICITUDES', ['solicitudes'])
		const usuariosRows = getSheetRows(sheetMap, 'USUARIOS', ['usuarios'])

		const parsedProcesos = procesosRows.map(parseProceso)
		const parsedActividades = actividadesRows.map(parseActividad)
		const parsedAdjuntos = adjuntosRows.map(parseAdjunto)
		const parsedActores = actoresRows.map(parseActor)
		const parsedSolicitudes = solicitudesRows.map(parseSolicitud)
		const parsedUsuarios = usuariosRows.map(parseUsuario)
		const parsedRegistros = registrosRows.map(parseRegistro)

		const orderedProcesos = parsedProcesos
			.map((process) => ({ ...process }))
			.sort((a, b) => {
				const diff = idToNumber(a.id) - idToNumber(b.id)
				if (diff !== 0) return diff
				return String(a.nombre).localeCompare(String(b.nombre))
			})

		setProcesses(orderedProcesos)
		setActivities(parsedActividades)
		setActivityAttachments(parsedAdjuntos)
		setActivityActors(parsedActores)
		setSolicitudes(parsedSolicitudes)

		const usersByKey = new Map()
		parsedUsuarios.forEach((user) => {
			const label = user.nombreCompleto || user.correo || `Usuario ${user.id}`
			usersByKey.set(String(user.id), label)
			if (user.correo) {
				usersByKey.set(user.correo.toLowerCase(), label)
			}
		})

		const solicitudesById = new Map()
		parsedSolicitudes.forEach((solicitud) => {
			solicitudesById.set(String(solicitud.id), solicitud)
		})

		const latestSolicitudByUser = new Map()
		parsedSolicitudes.forEach((solicitud) => {
			const key = String(solicitud.idUsuario)
			const existing = latestSolicitudByUser.get(key)
			if (!existing || idToNumber(solicitud.id) > idToNumber(existing.id)) {
				latestSolicitudByUser.set(key, solicitud)
			}
		})

		const recordList = parsedRegistros
			.map((registro) => {
				const linkedSolicitud =
					solicitudesById.get(String(registro.idSolicitud)) ||
					latestSolicitudByUser.get(String(registro.idUsuario)) ||
					null

				return {
					...registro,
					dateLabel: formatDate(registro.timestamp),
					userLabel:
						usersByKey.get(String(registro.idUsuario)) ||
						usersByKey.get(String(registro.idUsuario).toLowerCase()) ||
						registro.idUsuario ||
						'Sin usuario',
					solicitudId: linkedSolicitud?.id ?? registro.idSolicitud ?? null,
					idProceso: linkedSolicitud?.idProceso ?? '',
					solicitudActividadActual: linkedSolicitud?.actividadActual ?? null,
					solicitudFecha: linkedSolicitud?.fecha ?? null,
				}
			})
			.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

		setRecords(recordList)
	}, [])

	const loadDashboard = useCallback(async () => {
		setLoading(true)
		setError('')

		try {
			const sheetMap = await apiGetAllSheets(auth.token)
			hydrateDashboard(sheetMap)
		} catch (loadError) {
			if (isUnauthorizedError(loadError)) {
				logout()
				navigate('/login', { replace: true })
				return
			}

			setProcesses([])
			setActivities([])
			setActivityActors([])
			setActivityAttachments([])
			setSolicitudes([])
			setRecords([])
			setError('No se pudo cargar la informacion del dashboard.')
		}

		setLoading(false)
	}, [auth.token, hydrateDashboard, logout, navigate])

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

	const totalProcesses = processes.length
	const totalActivities = activities.length
	const totalRequests = solicitudes.length

	const groupedRecords = useMemo(() => {
		const solicitudCountByProcess = new Map()
		const solicitudCountByActivity = new Map()

		solicitudes.forEach((solicitud) => {
			const processKey = String(solicitud.idProceso ?? '')
			solicitudCountByProcess.set(
				processKey,
				(solicitudCountByProcess.get(processKey) ?? 0) + 1,
			)

			const activityKey = String(solicitud.actividadActual ?? '')
			if (activityKey) {
				solicitudCountByActivity.set(
					activityKey,
					(solicitudCountByActivity.get(activityKey) ?? 0) + 1,
				)
			}
		})

		return processes.map((process) => {
			const processActivities =
				activitiesByProcess.get(String(process.id)) ?? []

			return {
				...process,
				solicitudCount:
					solicitudCountByProcess.get(String(process.id)) ?? 0,
				activities: processActivities.map((activity) => {
					const items = records
						.filter(
							(record) =>
								String(record.idProceso) === String(process.id) &&
								matchesActivity(record.idActividad, activity),
						)
						.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

					const activityCount =
						solicitudCountByActivity.get(String(activity.id)) ??
						solicitudCountByActivity.get(String(activity.orden)) ??
						0

					return {
						...activity,
						solicitudCount: activityCount,
						items,
					}
				}),
			}
		})
	}, [activitiesByProcess, processes, records, solicitudes])

	const openFlow = useCallback(
		(record) => {
			const flowRecords = records.filter(
				(item) =>
					String(item.idUsuario) === String(record.idUsuario) &&
					String(item.idProceso) === String(record.idProceso),
			)

			const processActivities =
				activitiesByProcess.get(String(record.idProceso)) ?? []

			const flow = processActivities.map((activity) => {
				const matching = flowRecords
					.filter((item) => matchesActivity(item.idActividad, activity))
					.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]

				return { activity, registro: matching ?? null }
			})

			setSelectedRecord(record)
			setSelectedFlow(flow)
		},
		[activitiesByProcess, records],
	)

	const closeFlow = () => {
		setSelectedRecord(null)
		setSelectedFlow([])
	}

	const approveRecord = async (record) => {
		if (!record?.solicitudId || !record?.idActividad) return
		const processActivities =
			activitiesByProcess.get(String(record.idProceso)) ?? []
		const currentActivity =
			resolveActivity(processActivities, record.idActividad) ??
			processActivities[0] ??
			null
		const currentIndex = currentActivity
			? processActivities.findIndex(
					(activity) =>
						String(activity.id) === String(currentActivity.id),
				)
			: -1
		const nextActivity =
			currentIndex >= 0
				? processActivities[Math.min(currentIndex + 1, processActivities.length - 1)]
				: currentActivity
		const nextActivityId = nextActivity?.id ?? record.idActividad
		const fecha = new Date().toISOString().slice(0, 10)

		await apiPatch(
			`/api/sheets/registros/${record.solicitudId}/actividades/${record.idActividad}/aprobado`,
			{ aprobado: true },
			auth.token,
		)

		await apiPatch(
			`/api/sheets/solicitudes/${record.solicitudId}/actividad`,
			{ actividad_actual: nextActivityId, fecha },
			auth.token,
		)

		const sheetMap = await apiGetAllSheets(auth.token)
		hydrateDashboard(sheetMap)

		if (selectedRecord && selectedRecord.id === record.id) {
			openFlow({ ...record, aprobado: 'TRUE' })
		}
	}

	return (
		<section className="admin-page">
			<div className="page-intro">
				<h2>Dashboard Administrativo</h2>
				<p>
					Solicitudes por proceso con control de aprobacion y seguimiento de
					actividades.
				</p>
			</div>

			<div className="admin-kpis">
				<article>
					<span>Total procesos</span>
					<strong>{totalProcesses}</strong>
				</article>
				<article>
					<span>Total actividades</span>
					<strong>{totalActivities}</strong>
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
					{groupedRecords.length === 0 ? (
						<p className="empty-state">
							No hay procesos configurados.
						</p>
					) : (
						groupedRecords.map((group, index) => (
							<details
								key={group.id}
								className="admin-group"
								open={false}
							>
								<summary>
									<span>{group.nombre}</span>
									<span className="badge-count">
										{group.solicitudCount} solicitudes
									</span>
								</summary>

								<div className="admin-items">
									{group.activities.length === 0 ? (
										<p className="empty-state">
											No hay actividades para este proceso.
										</p>
									) : (
										group.activities.map((activity) => (
											<details
												key={activity.id}
												className="admin-group"
											>
												<summary>
													<span>{activity.nombre}</span>
													<span className="badge-count">
														{activity.solicitudCount} solicitudes
													</span>
												</summary>

												<div className="admin-items">
													{activity.items.length === 0 ? (
														<p className="empty-state">
															No hay registros en esta actividad.
														</p>
													) : (
														activity.items.map((record) => (
															<article
																key={`${activity.id}-${record.id}`}
																className="admin-record-item"
															>
																<button
																	type="button"
																	className="admin-record-link"
																	onClick={() => openFlow(record)}
																>
																	<span className="record-id">
																		{record.id}
																	</span>
																	<span className="record-date">
																		{record.dateLabel}
																	</span>
																	<span className="record-user">
																		{record.userLabel}
																	</span>
																</button>
																<div className="admin-actions">
																	<button
																		type="button"
																		className="record-approve-btn"
																		disabled={
																			String(record.aprobado).toLowerCase() ===
																				'true'
																		}
																		onClick={() => approveRecord(record)}
																	>
																		{String(record.aprobado).toLowerCase() ===
																			'true'
																				? 'Aprobado'
																				: 'Aprobar'}
																	</button>
																</div>
															</article>
														))
													)}
												</div>
											</details>
										))
									)}
								</div>
							</details>
						))
					)}
				</div>
			)}

			{selectedRecord ? (
				<div className="modal-backdrop" onClick={closeFlow}>
					<div className="modal" onClick={(event) => event.stopPropagation()}>
						<div className="modal-header">
							<div>
								<h3>Linea de tiempo de solicitud</h3>
								<p>
									Registro: {selectedRecord.id} |{' '}
									{selectedRecord.userLabel}
								</p>
							</div>
							<button
								type="button"
								className="modal-close"
								onClick={closeFlow}
							>
								Cerrar
							</button>
						</div>
						<div className="modal-body">
							<div className="timeline">
								{selectedFlow.map(({ activity, registro }, index) => {
									const sideClass = index % 2 === 0 ? 'left' : 'right'
									const actorNames = (
										actorsByActivity.get(String(activity.id)) ?? []
									)
										.map((actor) => actor.nombre)
										.filter(Boolean)
									const attachmentNames = (
										attachmentsByActivity.get(String(activity.id)) ?? []
									)
										.map((adjunto) => adjunto.nombre)
										.filter(Boolean)

									return (
										<article
											key={`${activity.id}-${index}`}
											className={`timeline-item ${sideClass} enabled`}
										>
											<div className="timeline-node">{activity.orden}</div>
											<div className="timeline-card">
												<h3>{activity.nombre}</h3>
												<p className="timeline-meta">
													Actores:{' '}
													<strong>
														{actorNames.length > 0
															? actorNames.join(', ')
															: 'Sin definir'}
													</strong>
												</p>
												{activity.tiempoMax ? (
													<p className="timeline-meta">
														Tiempo maximo:{' '}
														<strong>
															{activity.tiempoMax} dias
														</strong>
													</p>
												) : null}
												{attachmentNames.length > 0 ? (
													<p className="timeline-meta">
														Adjuntos:{' '}
														<strong>{attachmentNames.join(', ')}</strong>
													</p>
												) : null}
												{registro ? (
													<div className="request-summary">
														<p>
															<strong>Fecha:</strong>{' '}
															{formatDate(registro.timestamp)}
														</p>
														<p>
															<strong>Observacion:</strong>{' '}
															{registro.observacion || '-'}
														</p>
														<p>
															<strong>Aprobado:</strong>{' '}
															{String(registro.aprobado).toLowerCase() ===
																'true'
																? 'Si'
																: 'No'}
														</p>
														{registro.url ? (
															<p>
																<a
																	href={registro.url}
																	target="_blank"
																	rel="noreferrer"
																>
																	Ver documento
																</a>
															</p>
														) : null}
													</div>
												) : (
													<p className="disabled-note">
														No hay registro en esta actividad.
													</p>
												)}
											</div>
										</article>
									)
								})}
							</div>
						</div>
					</div>
				</div>
			) : null}
		</section>
	)
}

export default AdminDashboard