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

const defaultStages = [
	{ id: '1', nombre: 'Formulario de Postulacion', orden: 1 },
	{ id: '2', nombre: 'Formulario OAI', orden: 2 },
	{ id: '3', nombre: 'Unidad Academica', orden: 3 },
	{ id: '4', nombre: 'Cierre del proceso', orden: 4 },
]

const parseStage = (row, index) => ({
	id: String(pickValue(row, ['id', 'id_etapa'], 0) ?? index + 1),
	nombre: String(pickValue(row, ['nombre', 'etapa'], 1) ?? `Etapa ${index + 1}`),
	actor: String(pickValue(row, ['actor'], 2) ?? ''),
	tiempoMax: String(pickValue(row, ['tiempo_max', 'tiempomax'], 3) ?? ''),
	orden: Number(pickValue(row, ['orden', 'order'], 4) ?? index + 1),
})

const parseRegistro = (row, index) => ({
	id: String(pickValue(row, ['id'], 0) ?? `REG-${index + 1}`),
	timestamp: String(pickValue(row, ['timestamp', 'fecha'], 1) ?? ''),
	idUsuario: String(pickValue(row, ['id_usuario', 'usuario', 'correo'], 2) ?? ''),
	idEtapa: String(pickValue(row, ['id_etapa', 'etapa'], 3) ?? ''),
	observacion: String(pickValue(row, ['observacion', 'comentario'], 4) ?? ''),
	aprobado: String(pickValue(row, ['aprobado'], 5) ?? ''),
	url: String(pickValue(row, ['url', 'url_documento'], 6) ?? ''),
})

const parseSolicitud = (row, index) => ({
	id: String(pickValue(row, ['id', 'id_solicitud'], 0) ?? `SOL-${index + 1}`),
	idUsuario: String(pickValue(row, ['id_usuario', 'usuario'], 1) ?? ''),
	etapaActual: String(pickValue(row, ['etapa_actual', 'etapa'], 2) ?? ''),
	fecha: String(pickValue(row, ['fecha'], 3) ?? ''),
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

const AdminDashboard = () => {
	const navigate = useNavigate()
	const { auth, logout } = useAuth()
	const [records, setRecords] = useState([])
	const [stages, setStages] = useState(defaultStages)
	const [selectedRecord, setSelectedRecord] = useState(null)
	const [selectedFlow, setSelectedFlow] = useState([])
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

			const orderedStages = (steps.length > 0 ? steps : defaultStages)
				.map((stage) => ({ ...stage }))
				.sort((a, b) => Number(a.orden) - Number(b.orden))

			setStages(orderedStages)

			const usersByKey = new Map()
			usuarios.forEach((user) => {
				const label = user.nombreCompleto || user.correo || `Usuario ${user.id}`
				usersByKey.set(user.id, label)
				usersByKey.set(user.correo.toLowerCase(), label)
			})

			const latestSolicitudByUser = new Map()
			solicitudes.forEach((solicitud) => {
				const existing = latestSolicitudByUser.get(solicitud.idUsuario)
				if (!existing || idToNumber(solicitud.id) > idToNumber(existing.id)) {
					latestSolicitudByUser.set(solicitud.idUsuario, solicitud)
				}
			})

			const recordList = registros
				.map((registro) => {
					const solicitud = latestSolicitudByUser.get(registro.idUsuario) || null
					return {
						...registro,
						dateLabel: formatDate(registro.timestamp),
						userLabel:
							usersByKey.get(registro.idUsuario) ||
							usersByKey.get(registro.idUsuario.toLowerCase()) ||
							registro.idUsuario ||
							'Sin usuario',
						solicitudId: solicitud?.id ?? null,
						solicitudEtapaActual: solicitud?.etapaActual ?? null,
						solicitudFecha: solicitud?.fecha ?? null,
					}
				})
				.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

			setRecords(recordList)
		} catch (loadError) {
			if (isUnauthorizedError(loadError)) {
				logout()
				navigate('/login', { replace: true })
				return
			}

			setRecords([])
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

	const totalRequests = records.length
	const totalStages = stages.length

	const groupedRecords = useMemo(() => {
		return stages
			.map((stage) => ({
				...stage,
				items: records
					.filter(
						(record) => String(record.idEtapa) === String(stage.orden),
					)
					.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
			}))
	}, [records, stages])

	const openFlow = useCallback(
		(record) => {
			const flowRecords = records.filter(
				(item) => String(item.idUsuario) === String(record.idUsuario),
			)

			const flow = stages.map((stage) => {
				const matching = flowRecords.find(
					(item) => String(item.idEtapa) === String(stage.orden),
				)
				return { stage, registro: matching ?? null }
			})

			setSelectedRecord(record)
			setSelectedFlow(flow)
		},
		[records, stages],
	)

	const closeFlow = () => {
		setSelectedRecord(null)
		setSelectedFlow([])
	}

	const approveRecord = async (record) => {
		if (!record.solicitudId) return
		const currentEtapa = Number(record.idEtapa)
		const maxOrden = Math.max(...stages.map((stage) => Number(stage.orden || 0)))
		const nextEtapa = Math.min(currentEtapa + 1, maxOrden)
		const fecha = new Date().toISOString().slice(0, 10)

		await apiPatch(
			`/api/sheets/registros/${record.solicitudId}/etapas/${record.idEtapa}/aprobado`,
			{ aprobado: true },
			auth.token,
		)

		await apiPatch(
			`/api/sheets/solicitudes/${record.solicitudId}/etapa`,
			{ etapa_actual: nextEtapa, fecha },
			auth.token,
		)

		const sheetMap = await apiGetAllSheets(auth.token)
		const steps = getSheetRows(sheetMap, 'CONVENIOS_ETAPAS', [
			'convenios_etapas',
			'etapas',
		]).map(parseStage)
		setStages(steps.length > 0 ? steps : defaultStages)

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

		const latestSolicitudByUser = new Map()
		solicitudes.forEach((solicitud) => {
			const existing = latestSolicitudByUser.get(solicitud.idUsuario)
			if (!existing || idToNumber(solicitud.id) > idToNumber(existing.id)) {
				latestSolicitudByUser.set(solicitud.idUsuario, solicitud)
			}
		})

		const recordList = registros
			.map((registro) => {
				const solicitud = latestSolicitudByUser.get(registro.idUsuario) || null
				return {
					...registro,
					dateLabel: formatDate(registro.timestamp),
					userLabel:
						usersByKey.get(registro.idUsuario) ||
						usersByKey.get(registro.idUsuario.toLowerCase()) ||
						registro.idUsuario ||
						'Sin usuario',
						solicitudId: solicitud?.id ?? null,
						solicitudEtapaActual: solicitud?.etapaActual ?? null,
						solicitudFecha: solicitud?.fecha ?? null,
					}
				})
			.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

		setRecords(recordList)
		if (selectedRecord && selectedRecord.id === record.id) {
			openFlow({ ...record, aprobado: 'TRUE' })
		}
	}

	return (
		<section className="admin-page">
			<div className="page-intro">
				<h2>Dashboard Administrativo</h2>
				<p>
					Registros por usuario con control de aprobacion y seguimiento de flujo.
				</p>
			</div>

			<div className="admin-kpis">
				<article>
					<span>Total etapas</span>
					<strong>{totalStages}</strong>
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
					{groupedRecords.map((group, index) => (
						<details key={group.id} className="admin-group" open={index === 0}>
							<summary>
								<span>{group.nombre}</span>
								<span className="badge-count">{group.items.length} registros</span>
							</summary>

							<div className="admin-items">
								{group.items.length === 0 ? (
									<p className="empty-state">No hay registros en esta etapa.</p>
								) : (
									group.items.map((record) => (
										<article
											key={`${group.orden}-${record.id}`}
											className="admin-record-item"
										>
											<button
												type="button"
												className="admin-record-link"
												onClick={() => openFlow(record)}
											>
												<span className="record-id">{record.id}</span>
												<span className="record-date">{record.dateLabel}</span>
												<span className="record-user">{record.userLabel}</span>
											</button>
											<div className="admin-actions">
												<button
													type="button"
													className="record-approve-btn"
													disabled={
														String(record.aprobado).toLowerCase() === 'true'
													}
													onClick={() => approveRecord(record)}
												>
													{String(record.aprobado).toLowerCase() === 'true'
														? 'Aprobado'
														: 'Aprobar'}
												</button>
											</div>
										</article>
									))
								)}
							</div>
						</details>
					))}
				</div>
			)}

			{selectedRecord ? (
				<div className="modal-backdrop" onClick={closeFlow}>
					<div className="modal" onClick={(event) => event.stopPropagation()}>
						<div className="modal-header">
							<div>
								<h3>Flujo de solicitud</h3>
								<p>
									Registro: {selectedRecord.id} | {selectedRecord.userLabel}
								</p>
							</div>
							<button type="button" className="modal-close" onClick={closeFlow}>
								Cerrar
							</button>
						</div>
						<div className="modal-body">
							<div className="timeline">
								{selectedFlow.map(({ stage, registro }, index) => {
									const enabled = true
									const sideClass = index % 2 === 0 ? 'left' : 'right'

									return (
										<article
											key={`${stage.id}-${index}`}
											className={`timeline-item ${sideClass} ${enabled ? 'enabled' : 'disabled'}`}
										>
											<div className="timeline-node">{stage.orden}</div>
											<div className="timeline-card">
												<h3>{stage.nombre}</h3>
												<p className="timeline-meta">
													Actor: <strong>{stage.actor || 'Sin definir'}</strong>
												</p>
												{stage.tiempoMax ? (
													<p className="timeline-meta">
														Tiempo maximo: <strong>{stage.tiempoMax} dias</strong>
													</p>
												) : null}
												{registro ? (
													<div className="request-summary">
														<p>
															<strong>Fecha:</strong> {formatDate(registro.timestamp)}
														</p>
														<p>
															<strong>Observacion:</strong>{' '}
															{registro.observacion || '-'}
														</p>
														<p>
															<strong>Aprobado:</strong>{' '}
															{String(registro.aprobado).toLowerCase() === 'true'
																? 'Si'
																: 'No'}
														</p>
														{registro.url ? (
															<p>
																<a href={registro.url} target="_blank" rel="noreferrer">
																	Ver documento
																</a>
															</p>
														) : null}
													</div>
												) : (
													<p className="disabled-note">
														No hay registro en esta etapa.
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
