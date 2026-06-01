import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  apiGetAllSheets,
  apiPost,
  getSheetRows,
  isUnauthorizedError,
  pickValue,
} from "../api/api";
import { useAuth } from "../context/AuthContext";

const parseProceso = (row, index) => ({
  id: String(pickValue(row, ["id"], 0) ?? index + 1),
  nombre: String(pickValue(row, ["nombre"], 1) ?? `Proceso ${index + 1}`),
});

const parseBooleanFlag = (value) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  if (["true", "1", "si", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return null;
};

const parseActividad = (row, index) => ({
  id: String(pickValue(row, ["id"], 0) ?? index + 1),
  idProceso: String(pickValue(row, ["id_proceso", "proceso"], 1) ?? ""),
  idAdjunto: String(pickValue(row, ["id_adjunto", "adjunto"], 2) ?? ""),
  nombre: String(
    pickValue(row, ["nombre", "actividad"], 3) ?? `Actividad ${index + 1}`,
  ),
  tiempoMax: String(pickValue(row, ["tiempo_max", "tiempomax"], 4) ?? ""),
  orden: Number(pickValue(row, ["orden", "order"], 5) ?? index + 1),
  docente: parseBooleanFlag(pickValue(row, ["docente"], 6)),
  adjunto: parseBooleanFlag(pickValue(row, ["adjunto", "archivo"], 7)),
});

const parseAdjunto = (row, index) => ({
  id: String(pickValue(row, ["id"], 0) ?? index + 1),
  idActividad: String(pickValue(row, ["id_actividad", "actividad"], 1) ?? ""),
  nombre: String(pickValue(row, ["nombre"], 2) ?? `Adjunto ${index + 1}`),
});

const parseDocumento = (row, index) => ({
  id: String(pickValue(row, ["id"], 0) ?? index + 1),
  idRegistro: String(pickValue(row, ["id_registro", "registro"], 1) ?? ""),
  url: String(pickValue(row, ["url", "url_documento"], 2) ?? ""),
  fechaSubida: String(pickValue(row, ["fecha_subida", "fecha"], 3) ?? ""),
});

const parseActor = (row, index) => ({
  id: String(pickValue(row, ["id"], 0) ?? index + 1),
  idActividad: String(pickValue(row, ["id_actividad", "actividad"], 1) ?? ""),
  nombre: String(
    pickValue(row, ["nombre", "actor"], 2) ?? `Actor ${index + 1}`,
  ),
});

const parseUsuario = (row, index) => ({
  id: String(pickValue(row, ["id"], 0) ?? index + 1),
  correo: String(pickValue(row, ["correo", "email"], 1) ?? ""),
  nombres: String(pickValue(row, ["nombres", "name"], 2) ?? ""),
  apellidos: String(pickValue(row, ["apellidos", "lastname"], 3) ?? ""),
  rol: String(pickValue(row, ["rol", "role"], 4) ?? ""),
});

const parseRegistro = (row, index) => ({
  id: String(pickValue(row, ["id"], 0) ?? `REG-${index + 1}`),
  idUsuario: String(pickValue(row, ["id_usuario", "usuario"], 1) ?? ""),
  idActividad: String(pickValue(row, ["id_actividad", "actividad"], 2) ?? ""),
  idSolicitud: String(pickValue(row, ["id_solicitud", "solicitud"], 3) ?? ""),
  timestamp: String(pickValue(row, ["timestamp", "fecha"], 4) ?? ""),
  observacion: String(pickValue(row, ["observacion", "comentario"], 5) ?? ""),
  aprobado: String(pickValue(row, ["aprobado"], 6) ?? ""),
  urlDocumento: String(pickValue(row, ["url", "url_documento"], 7) ?? ""),
});

const parseSolicitud = (row, index) => ({
  id: String(pickValue(row, ["id"], 0) ?? index + 1),
  idUsuario: String(pickValue(row, ["id_usuario", "usuario"], 1) ?? ""),
  idProceso: String(pickValue(row, ["id_proceso", "proceso"], 2) ?? ""),
  actividadActual: String(
    pickValue(row, ["actividad_actual", "actividad"], 3) ?? "",
  ),
  fecha: String(pickValue(row, ["fecha"], 4) ?? ""),
});

const idToNumber = (value) => {
  const matches = String(value ?? "").match(/\d+/g);
  if (!matches || matches.length === 0) return 0;
  const candidate = Number(matches[matches.length - 1]);
  return Number.isFinite(candidate) ? candidate : 0;
};

const getNextId = (rows) => {
  const maxId = rows.reduce((max, row) => {
    const rowId = pickValue(row, ["id"], 0);
    return Math.max(max, idToNumber(rowId));
  }, 0);

  return String(maxId + 1);
};

const findUserByEmail = (rows, email) => {
  const emailTarget = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!emailTarget) return null;

  const row = rows.find((candidate) => {
    const rowEmail = String(
      pickValue(candidate, ["correo", "email"], 1) ?? "",
    ).toLowerCase();
    return rowEmail === emailTarget;
  });

  return row ? parseUsuario(row, 0) : null;
};

const splitUserName = (fullName) => {
  const partes = fullName.trim().split(/\s+/);

  if (partes.length < 2) {
    return { nombres: fullName, apellidos: "" };
  }

  const apellidos = partes.slice(-2).join(" ");
  const nombres = partes.slice(0, -2).join(" ");

  return { nombres, apellidos };
};

const formatRequestDate = (timestamp) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp || "-";
  return date.toLocaleDateString("es-CO");
};

const resolveActivity = (activities, activityRef) => {
  if (!activities || activities.length === 0) return null;
  const ref = String(activityRef ?? "");
  if (!ref) return null;
  const direct = activities.find((activity) => String(activity.id) === ref);
  if (direct) return direct;
  const refNumber = Number(ref);
  if (!Number.isFinite(refNumber)) return null;
  return (
    activities.find((activity) => Number(activity.orden) === refNumber) ?? null
  );
};

const matchesActivity = (activityRef, activity) => {
  const ref = String(activityRef ?? "");
  if (!ref) return false;
  return ref === String(activity.id) || ref === String(activity.orden);
};

const UserPage = () => {
  const navigate = useNavigate();
  const { auth, logout, updateAuthUser } = useAuth();
  const [processes, setProcesses] = useState([]);
  const [activities, setActivities] = useState([]);
  const [activityActors, setActivityActors] = useState([]);
  const [activityAttachments, setActivityAttachments] = useState([]);
  const [myRecords, setMyRecords] = useState([]);
  const [mySolicitudes, setMySolicitudes] = useState([]);
  const [selectedProcessId, setSelectedProcessId] = useState("");
  const [userSheet, setUserSheet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formData, setFormData] = useState({
    observacion: "",
    urlSoporte: "",
    urlDocumento: "",
  });

  const activitiesByProcess = useMemo(() => {
    const map = new Map();
    activities.forEach((activity) => {
      const key = String(activity.idProceso ?? "");
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(activity);
    });
    map.forEach((list) => {
      list.sort((a, b) => Number(a.orden) - Number(b.orden));
    });
    return map;
  }, [activities]);

  const actorsByActivity = useMemo(() => {
    const map = new Map();
    activityActors.forEach((actor) => {
      const key = String(actor.idActividad ?? "");
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(actor);
    });
    return map;
  }, [activityActors]);

  const attachmentsByActivity = useMemo(() => {
    const map = new Map();
    activityAttachments.forEach((adjunto) => {
      const key = String(adjunto.idActividad ?? "");
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(adjunto);
    });
    return map;
  }, [activityAttachments]);

  const selectedActivities = useMemo(
    () => activitiesByProcess.get(String(selectedProcessId)) ?? [],
    [activitiesByProcess, selectedProcessId],
  );

  const activeSolicitud = useMemo(() => {
    if (!selectedProcessId) return null;
    const filtered = mySolicitudes.filter(
      (solicitud) => String(solicitud.idProceso) === String(selectedProcessId),
    );

    return (
      filtered.sort((a, b) => idToNumber(b.id) - idToNumber(a.id))[0] ?? null
    );
  }, [mySolicitudes, selectedProcessId]);

  const currentActivity = useMemo(() => {
    if (selectedActivities.length === 0) return null;
    if (activeSolicitud?.actividadActual) {
      return (
        resolveActivity(selectedActivities, activeSolicitud.actividadActual) ??
        selectedActivities[0]
      );
    }
    return selectedActivities[0];
  }, [activeSolicitud, selectedActivities]);

  const solicitudesById = useMemo(() => {
    const map = new Map();
    mySolicitudes.forEach((solicitud) => {
      map.set(String(solicitud.id), solicitud);
    });
    return map;
  }, [mySolicitudes]);

  const getRecordForActivity = useCallback(
    (activity) => {
      if (!activity) return null;
      const recordsForProcess = myRecords.filter((record) => {
        if (activeSolicitud?.id) {
          return (
            String(record.idSolicitud) === String(activeSolicitud.id) &&
            matchesActivity(record.idActividad, activity)
          );
        }
        const solicitud = solicitudesById.get(String(record.idSolicitud));
        if (
          selectedProcessId &&
          String(solicitud?.idProceso) !== String(selectedProcessId)
        ) {
          return false;
        }
        return matchesActivity(record.idActividad, activity);
      });

      return (
        recordsForProcess.sort((a, b) =>
          b.timestamp.localeCompare(a.timestamp),
        )[0] ?? null
      );
    },
    [activeSolicitud, myRecords, selectedProcessId, solicitudesById],
  );

  const hydrateFromSheets = useCallback(
    (sheetMap) => {
      const procesosRows = getSheetRows(sheetMap, "PROCESOS", ["procesos"]);
      const actividadesRows = getSheetRows(sheetMap, "ACTIVIDADES", [
        "actividades",
      ]);
      const adjuntosRows = getSheetRows(sheetMap, "ADJUNTOS_ACTIVIDADES", [
        "adjuntos_actividades",
        "adjuntos",
      ]);
      const actoresRows = getSheetRows(sheetMap, "ACTIVIDAD_ACTOR", [
        "actividad_actor",
        "actores",
      ]);
      const parsedProcesos = procesosRows.map(parseProceso);
      const parsedActividades = actividadesRows.map(parseActividad);
      const parsedAdjuntos = adjuntosRows.map(parseAdjunto);
      const parsedActores = actoresRows.map(parseActor);

      const orderedProcesos = parsedProcesos
        .map((process) => ({ ...process }))
        .sort((a, b) => {
          const diff = idToNumber(a.id) - idToNumber(b.id);
          if (diff !== 0) return diff;
          return String(a.nombre).localeCompare(String(b.nombre));
        });

      setProcesses(orderedProcesos);
      setActivities(parsedActividades);
      setActivityAttachments(parsedAdjuntos);
      setActivityActors(parsedActores);

      const usersRows = getSheetRows(sheetMap, "USUARIOS", ["usuarios"]);
      const foundUser = findUserByEmail(usersRows, auth.user?.email);
      setUserSheet(foundUser);

      if (foundUser) {
        updateAuthUser({
          id: foundUser.id,
          rol: String(foundUser.rol ?? "")
            .trim()
            .toLowerCase(),
        });
      }

      const registrosRows = getSheetRows(sheetMap, "REGISTROS", ["registros"]);
      const documentosRows = getSheetRows(sheetMap, "DOCUMENTOS", [
        "documentos",
      ]);
      const solicitudesRows = getSheetRows(sheetMap, "SOLICITUDES", [
        "solicitudes",
      ]);
      const parsedRegistros = registrosRows.map(parseRegistro);
      const parsedDocumentos = documentosRows.map(parseDocumento);
      const parsedSolicitudes = solicitudesRows.map(parseSolicitud);
      const documentoByRegistro = new Map();
      parsedDocumentos.forEach((documento) => {
        if (!documento.idRegistro) return;
        documentoByRegistro.set(String(documento.idRegistro), documento);
      });
      const ownRegistros = foundUser
        ? parsedRegistros.filter(
            (registro) => String(registro.idUsuario) === String(foundUser.id),
          )
        : [];

      const ownSolicitudes = foundUser
        ? parsedSolicitudes.filter(
            (solicitud) => String(solicitud.idUsuario) === String(foundUser.id),
          )
        : [];

      const enrichedRegistros = ownRegistros
        .map((registro) => ({
          ...registro,
          documentoUrl: documentoByRegistro.get(String(registro.id))?.url ?? "",
        }))
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      setMyRecords(enrichedRegistros);
      setMySolicitudes(ownSolicitudes);

      setSelectedProcessId((prev) => {
        if (
          prev &&
          orderedProcesos.some((process) => String(process.id) === String(prev))
        ) {
          return prev;
        }
        return orderedProcesos[0]?.id ?? "";
      });
    },
    [auth.user?.email, updateAuthUser],
  );

  const loadUserData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const sheetMap = await apiGetAllSheets(auth.token);
      hydrateFromSheets(sheetMap);
    } catch (loadError) {
      if (isUnauthorizedError(loadError)) {
        logout();
        navigate("/login", { replace: true });
        return;
      }

      setProcesses([]);
      setActivities([]);
      setActivityActors([]);
      setActivityAttachments([]);
      setMyRecords([]);
      setMySolicitudes([]);
      setSelectedProcessId("");
      setError("No se pudieron cargar tus solicitudes. Intenta nuevamente.");
    }

    setLoading(false);
  }, [auth.token, hydrateFromSheets, logout, navigate]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      await Promise.resolve();
      if (active) {
        await loadUserData();
      }
    };

    run();

    return () => {
      active = false;
    };
  }, [loadUserData]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleProcessChange = (event) => {
    setSelectedProcessId(event.target.value);
    setFormMessage("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const cleanObservation = formData.observacion.trim();
    if (!cleanObservation) {
      setFormMessage("Debes escribir una observacion para crear la solicitud.");
      return;
    }

    if (!selectedProcessId) {
      setFormMessage("Selecciona un proceso antes de enviar la solicitud.");
      return;
    }

    const processActivities =
      activitiesByProcess.get(String(selectedProcessId)) ?? [];
    if (processActivities.length === 0) {
      setFormMessage("No hay actividades definidas para este proceso.");
      return;
    }

    const cleanSupportUrl = formData.urlSoporte.trim();
    const cleanDocumentUrl = formData.urlDocumento.trim();
    let requiresAttachment;

    setFormLoading(true);
    setFormMessage("");

    try {
      console.log("[UserPage] Iniciando registro de actividad", {
        selectedProcessId,
        userEmail: auth.user?.email ?? "",
      });
      const sheetMap = await apiGetAllSheets(auth.token);
      const usersRows = getSheetRows(sheetMap, "USUARIOS", ["usuarios"]);
      const documentosRows = getSheetRows(sheetMap, "DOCUMENTOS", [
        "documentos",
      ]);
      const registrosRows = getSheetRows(sheetMap, "REGISTROS", ["registros"]);
      const solicitudesRows = getSheetRows(sheetMap, "SOLICITUDES", [
        "solicitudes",
      ]);

      let currentUser = findUserByEmail(usersRows, auth.user?.email);

      if (!currentUser) {
        const nextUserId = getNextId(usersRows);
        const { nombres, apellidos } = splitUserName(auth.user?.name ?? "");

        await apiPost(
          "/api/sheets/USUARIOS/rows",
          {
            values: [nextUserId, "", nombres, apellidos, ""],
            userEmailColumnIndex: 1,
          },
          auth.token,
        );

        currentUser = {
          id: nextUserId,
          correo: auth.user?.email ?? "",
          nombres,
          apellidos,
          rol: "",
        };

        setUserSheet(currentUser);
        updateAuthUser({
          id: nextUserId,
          rol: "",
        });
      }

      const parsedSolicitudes = solicitudesRows.map(parseSolicitud);
      const userSolicitudes = parsedSolicitudes.filter(
        (solicitud) => String(solicitud.idUsuario) === String(currentUser.id),
      );
      const solicitudToUse =
        userSolicitudes
          .filter(
            (solicitud) =>
              String(solicitud.idProceso) === String(selectedProcessId),
          )
          .sort((a, b) => idToNumber(b.id) - idToNumber(a.id))[0] ?? null;
      const targetActivity = solicitudToUse
        ? (resolveActivity(processActivities, solicitudToUse.actividadActual) ??
          processActivities[0])
        : processActivities[0];
      const isAdminActivity = targetActivity?.docente === false;
      requiresAttachment = targetActivity?.adjunto === true;

      console.log("[UserPage] Actividad objetivo", {
        activityId: targetActivity?.id ?? "",
        activityOrden: targetActivity?.orden ?? "",
        docente: targetActivity?.docente ?? null,
        adjunto: targetActivity?.adjunto ?? null,
      });

      if (isAdminActivity) {
        setFormMessage("Esta actividad corresponde al administrador.");
        return;
      }

      if (requiresAttachment && !cleanDocumentUrl) {
        setFormMessage(
          "Debes indicar la URL del documento para completar la actividad.",
        );
        return;
      }
      const existingRecord = myRecords.find(
        (record) =>
          String(record.idUsuario) === String(currentUser.id) &&
          String(record.idSolicitud) === String(solicitudToUse?.id ?? "") &&
          matchesActivity(record.idActividad, targetActivity),
      );

      if (existingRecord) {
        setFormMessage("Ya existe un registro para esta actividad.");
        setFormLoading(false);
        return;
      }

      const nextRegistroId = getNextId(registrosRows);

      const nextSolicitudId = getNextId(solicitudesRows);
      const currentTimestamp = new Date().toISOString();
      const currentDate = new Date().toISOString().slice(0, 10);
      const uploadedUrl = cleanSupportUrl;
      const nextDocumentoId = requiresAttachment
        ? getNextId(documentosRows)
        : null;
      const fechaSubida = requiresAttachment ? new Date().toISOString() : null;

      let solicitudId = solicitudToUse?.id ?? null;
      if (!solicitudId) {
        solicitudId = nextSolicitudId;
        await apiPost(
          "/api/sheets/SOLICITUDES/rows",
          {
            values: [
              solicitudId,
              String(currentUser.id),
              String(selectedProcessId),
              String(targetActivity?.id ?? ""),
              currentDate,
            ],
          },
          auth.token,
        );
      }

      console.log("[UserPage] Creando registro", {
        registroId: nextRegistroId,
        solicitudId,
        activityId: targetActivity?.id ?? "",
      });
      await apiPost(
        "/api/sheets/REGISTROS/rows",
        {
          values: [
            nextRegistroId,
            String(currentUser.id),
            String(targetActivity?.id ?? ""),
            String(solicitudId),
            currentTimestamp,
            cleanObservation,
            true,
            uploadedUrl,
          ],
        },
        auth.token,
      );

      if (
        requiresAttachment &&
        nextDocumentoId &&
        cleanDocumentUrl &&
        fechaSubida
      ) {
        await apiPost(
          "/api/sheets/DOCUMENTOS/rows",
          {
            values: [
              nextDocumentoId,
              String(nextRegistroId),
              cleanDocumentUrl,
              fechaSubida,
            ],
          },
          auth.token,
        );
      }

      const refreshSheetMap = await apiGetAllSheets(auth.token);
      hydrateFromSheets(refreshSheetMap);
      setFormData({ observacion: "", urlSoporte: "", urlDocumento: "" });
      setFormMessage(
        solicitudToUse
          ? "Registro enviado correctamente para la actividad."
          : "Solicitud creada correctamente para el proceso seleccionado.",
      );
    } catch (submitError) {
      console.error("[UserPage] Error al guardar actividad", {
        message: submitError?.message,
        status: submitError?.response?.status,
        data: submitError?.response?.data,
      });
      if (isUnauthorizedError(submitError)) {
        logout();
        navigate("/login", { replace: true });
        return;
      }

      const message =
        submitError?.response?.data?.message ||
        "No se pudo guardar la solicitud en el backend.";
      setFormMessage(message);
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <section className="user-page">
      <svg
        class="decoracion-roja"
        viewBox="0 0 1000 500"
        preserveAspectRatio="none"
      >
        <path
          d="M0,150 Q50,150 50,200 T5,300 "
          stroke="red"
          fill="transparent"
          stroke-width="3"
          stroke-dasharray="5,5"
        />

        <path
          d="M998,300 Q950,250 950,150 T1000,50"
          stroke="red"
          fill="transparent"
          stroke-width="3"
          stroke-dasharray="5,5"
        />
      </svg>
      <div className="page-intro">
        <h2>Ruta de {processes?.[0]?.nombre ?? "Proceso"}</h2>
        <p>
          Selecciona el proceso que quieres iniciar. Cada proceso tiene su
          propia linea de tiempo de actividades y solo la actividad actual
          estara habilitada.
        </p>
      </div>

      {processes.length > 0 ? (
        <div className="process-selector">
          <label htmlFor="processSelect">Proceso</label>
          <select
            id="processSelect"
            value={selectedProcessId}
            onChange={handleProcessChange}
          >
            <option value="" disabled>
              Selecciona un proceso
            </option>
            {processes.map((process) => (
              <option key={process.id} value={process.id}>
                {process.nombre}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {userSheet ? (
        <p className="timeline-meta">Bienvenido</p>
      ) : (
        <p className="timeline-meta">
          Aun no estas registrado en USUARIOS. Se creara el usuario cuando
          envies tu primera solicitud.
        </p>
      )}

      {activeSolicitud ? (
        <p className="timeline-meta">
          Solicitud actual: {activeSolicitud.id} | Actividad actual:{" "}
          {currentActivity?.nombre ?? "-"}
        </p>
      ) : null}

      {error ? <p className="message error">{error}</p> : null}

      {loading ? (
        <div className="page-state">
          <p>Cargando informacion de tu proceso...</p>
        </div>
      ) : selectedProcessId && selectedActivities.length > 0 ? (
        <div className="timeline">
          {selectedActivities.map((activity, index) => {
            const sideClass = index % 2 === 0 ? "left" : "right";
            const activityRecord = getRecordForActivity(activity);
            const isCurrent =
              currentActivity &&
              String(activity.id) === String(currentActivity.id);
            const isAdminActivity = activity.docente === false;
            const requiresAttachment = activity.adjunto === true;
            const enabled =
              (isCurrent || Boolean(activityRecord)) && !isAdminActivity;
            const actorNames = (actorsByActivity.get(String(activity.id)) ?? [])
              .map((actor) => actor.nombre)
              .filter(Boolean);
            const attachmentNames = (
              attachmentsByActivity.get(String(activity.id)) ?? []
            )
              .map((adjunto) => adjunto.nombre)
              .filter(Boolean);

            return (
              <article
                key={`${activity.id}-${index}`}
                className={`timeline-item ${sideClass} ${
                  enabled ? "enabled" : "disabled"
                }`}
              >
                <div className="timeline-node">{activity.orden}</div>

                <div className="timeline-card">
                  <h3>{activity.nombre}</h3>
                  <p className="timeline-meta">
                    Actores:{" "}
                    <strong>
                      {actorNames.length > 0
                        ? actorNames.join(", ")
                        : "Sin definir"}
                    </strong>
                  </p>
                  {activity.tiempoMax ? (
                    <p className="timeline-meta">
                      Tiempo maximo: <strong>{activity.tiempoMax} dias</strong>
                    </p>
                  ) : null}
                  {attachmentNames.length > 0 ? (
                    <p className="timeline-meta">
                      Adjuntos: <strong>{attachmentNames.join(", ")}</strong>
                    </p>
                  ) : null}

                  {isCurrent && !activityRecord && !isAdminActivity ? (
                    <form className="request-form" onSubmit={handleSubmit}>
                      <label htmlFor="observacion">
                        Observacion de la actividad
                      </label>
                      <textarea
                        id="observacion"
                        name="observacion"
                        placeholder="Escribe un resumen para esta actividad"
                        value={formData.observacion}
                        onChange={handleChange}
                        rows={4}
                        required
                      />

                      <label htmlFor="urlSoporte">
                        URL de soporte (opcional)
                      </label>
                      <input
                        id="urlSoporte"
                        name="urlSoporte"
                        type="url"
                        placeholder="https://ejemplo.com/documento-soporte"
                        value={formData.urlSoporte}
                        onChange={handleChange}
                      />

                      {requiresAttachment ? (
                        <>
                          <label htmlFor="urlDocumento">
                            URL del documento exigido
                          </label>
                          <input
                            id="urlDocumento"
                            name="urlDocumento"
                            type="url"
                            placeholder="https://ejemplo.com/documento-obligatorio"
                            value={formData.urlDocumento}
                            onChange={handleChange}
                            required
                          />
                        </>
                      ) : null}

                      <button type="submit" disabled={formLoading}>
                        {formLoading ? "Guardando..." : "Completar"}
                      </button>
                    </form>
                  ) : activityRecord ? (
                    <div className="request-summary">
                      <p>
                        <strong>Solicitud:</strong>{" "}
                        {activityRecord.idSolicitud || "-"}
                      </p>
                      <p>
                        <strong>Fecha:</strong>{" "}
                        {formatRequestDate(activityRecord.timestamp)}
                      </p>
                      <p>
                        <strong>Observacion:</strong>{" "}
                        {activityRecord.observacion || "-"}
                      </p>
                      <p>
                        <strong>Aprobado:</strong>{" "}
                        {String(activityRecord.aprobado).toLowerCase() ===
                        "true"
                          ? "Si"
                          : "No"}
                      </p>
                      {activityRecord.urlDocumento ? (
                        <p>
                          <a
                            href={activityRecord.urlDocumento}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ver documento soporte
                          </a>
                        </p>
                      ) : null}
                      {activityRecord.documentoUrl ? (
                        <p>
                          <a
                            href={activityRecord.documentoUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ver documento obligatorio
                          </a>
                        </p>
                      ) : null}
                      {isCurrent ? (
                        <p className="timeline-meta">
                          En espera de aprobacion para continuar.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="disabled-note">
                      {isAdminActivity
                        ? "Actividad asignada al administrador."
                        : "Esta actividad estara disponible cuando avances en el proceso."}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="empty-state">
          Selecciona un proceso para ver sus actividades.
        </p>
      )}

      {formMessage ? <p className="message info">{formMessage}</p> : null}
    </section>
  );
};

export default UserPage;
