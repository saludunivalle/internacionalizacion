import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  apiGetAllSheets,
  apiPost,
  apiPatch,
  getSheetRows,
  isUnauthorizedError,
  pickValue,
} from "../api/api";
import { useAuth } from "../context/AuthContext";

const parseProceso = (row, index) => ({
  id: String(pickValue(row, ["id"], 0) ?? index + 1),
  nombre: String(pickValue(row, ["nombre"], 1) ?? `Proceso ${index + 1}`),
});

const parseActividad = (row, index) => ({
  id: String(pickValue(row, ["id"], 0) ?? index + 1),
  idProceso: String(pickValue(row, ["id_proceso", "proceso"], 1) ?? ""),
  idAdjunto: String(pickValue(row, ["id_adjunto", "adjunto"], 2) ?? ""),
  nombre: String(
    pickValue(row, ["nombre", "actividad"], 3) ?? `Actividad ${index + 1}`,
  ),
  tiempoMax: String(pickValue(row, ["tiempo_max", "tiempomax"], 4) ?? ""),
  orden: Number(pickValue(row, ["orden", "order"], 5) ?? index + 1),
});

const parseAdjunto = (row, index) => ({
  id: String(pickValue(row, ["id"], 0) ?? index + 1),
  idActividad: String(pickValue(row, ["id_actividad", "actividad"], 1) ?? ""),
  nombre: String(pickValue(row, ["nombre"], 2) ?? `Adjunto ${index + 1}`),
});

const parseActor = (row, index) => ({
  id: String(pickValue(row, ["id"], 0) ?? index + 1),
  idActividad: String(pickValue(row, ["id_actividad", "actividad"], 1) ?? ""),
  nombre: String(
    pickValue(row, ["nombre", "actor"], 2) ?? `Actor ${index + 1}`,
  ),
});

const parseRegistro = (row, index) => ({
  id: String(pickValue(row, ["id"], 0) ?? `REG-${index + 1}`),
  idUsuario: String(pickValue(row, ["id_usuario", "usuario"], 1) ?? ""),
  idActividad: String(pickValue(row, ["id_actividad", "actividad"], 2) ?? ""),
  idSolicitud: String(pickValue(row, ["id_solicitud", "solicitud"], 3) ?? ""),
  timestamp: String(pickValue(row, ["timestamp", "fecha"], 4) ?? ""),
  observacion: String(pickValue(row, ["observacion", "comentario"], 5) ?? ""),
  aprobado: String(pickValue(row, ["aprobado"], 6) ?? ""),
  url: String(pickValue(row, ["url", "url_documento"], 7) ?? ""),
});

const parseSolicitud = (row, index) => ({
  id: String(pickValue(row, ["id"], 0) ?? `SOL-${index + 1}`),
  idUsuario: String(pickValue(row, ["id_usuario", "usuario"], 1) ?? ""),
  idProceso: String(pickValue(row, ["id_proceso", "proceso"], 2) ?? ""),
  actividadActual: String(
    pickValue(row, ["actividad_actual", "actividad"], 3) ?? "",
  ),
  fecha: String(pickValue(row, ["fecha"], 4) ?? ""),
});

const parseDatosIniciales = (row, index) => ({
  id: String(pickValue(row, ["id"], 0) ?? index + 1),
  idSolicitud: String(pickValue(row, ["id_solicitud", "solicitud"], 1) ?? ""),
  nombre: String(pickValue(row, ["nombre"], 2) ?? ""),
  correo: String(pickValue(row, ["correo", "email"], 3) ?? ""),
});

const parseUsuario = (row, index) => {
  const names = String(pickValue(row, ["nombres", "name"], 2) ?? "").trim();
  const lastNames = String(
    pickValue(row, ["apellidos", "lastname"], 3) ?? "",
  ).trim();
  const fullName = [names, lastNames].filter(Boolean).join(" ").trim();

  return {
    id: String(pickValue(row, ["id"], 0) ?? index + 1),
    correo: String(pickValue(row, ["correo", "email"], 1) ?? ""),
    nombreCompleto: fullName,
    rol: String(pickValue(row, ["rol", "role"], 4) ?? ""),
  };
};

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
  const cleanName = String(fullName ?? "").trim();
  if (!cleanName) return { nombres: "", apellidos: "" };

  const partes = cleanName.split(/\s+/);
  if (partes.length < 2) {
    return { nombres: cleanName, apellidos: "" };
  }

  const apellidos = partes.slice(-2).join(" ");
  const nombres = partes.slice(0, -2).join(" ");

  return { nombres, apellidos };
};

const formatDate = (timestamp) => {
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

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { auth, logout, isAdmin } = useAuth();
  const [processes, setProcesses] = useState([]);
  const [activities, setActivities] = useState([]);
  const [activityActors, setActivityActors] = useState([]);
  const [activityAttachments, setActivityAttachments] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [records, setRecords] = useState([]);
  const [initialDataBySolicitud, setInitialDataBySolicitud] = useState(
    new Map(),
  );
  const [userLabels, setUserLabels] = useState(new Map());
  const [selectedSolicitud, setSelectedSolicitud] = useState(null);
  const [selectedFlow, setSelectedFlow] = useState([]);
  const [viewMode, setViewMode] = useState("steps");
  const [activityForms, setActivityForms] = useState({});
  const [modalMessage, setModalMessage] = useState("");
  const [modalMessageType, setModalMessageType] = useState("");
  const [submittingActivity, setSubmittingActivity] = useState("");
  const [showStartForm, setShowStartForm] = useState(false);
  const [startForm, setStartForm] = useState({
    nombre: "",
    correo: "",
    observacion: "",
    urlDocumento: "",
  });
  const [startLoading, setStartLoading] = useState(false);
  const [startMessage, setStartMessage] = useState("");
  const [startMessageType, setStartMessageType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const solicitudesById = useMemo(() => {
    const map = new Map();
    solicitudes.forEach((solicitud) => {
      map.set(String(solicitud.id), solicitud);
    });
    return map;
  }, [solicitudes]);

  const recordsBySolicitud = useMemo(() => {
    const map = new Map();
    records.forEach((record) => {
      const key = String(record.solicitudId ?? record.idSolicitud ?? "");
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(record);
    });
    map.forEach((list) => {
      list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    });
    return map;
  }, [records]);

  const firstProcessId = useMemo(() => processes[0]?.id ?? "", [processes]);
  const firstProcessActivities = useMemo(
    () => activitiesByProcess.get(String(firstProcessId)) ?? [],
    [activitiesByProcess, firstProcessId],
  );
  const firstActivity = firstProcessActivities[0] ?? null;

  const resolveSolicitudLabel = useCallback(
    (solicitud) => {
      if (!solicitud) return "Sin usuario";
      const idKey = String(solicitud.idUsuario ?? "");
      const emailKey = String(solicitud.idUsuario ?? "").toLowerCase();
      const initialData = initialDataBySolicitud.get(String(solicitud.id));
      return (
        initialData?.nombre ||
        userLabels.get(idKey) ||
        userLabels.get(emailKey) ||
        solicitud.idUsuario ||
        "Sin usuario"
      );
    },
    [initialDataBySolicitud, userLabels],
  );

  const hydrateDashboard = useCallback((sheetMap) => {
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
    const registrosRows = getSheetRows(sheetMap, "REGISTROS", ["registros"]);
    const solicitudesRows = getSheetRows(sheetMap, "SOLICITUDES", [
      "solicitudes",
    ]);
    const usuariosRows = getSheetRows(sheetMap, "USUARIOS", ["usuarios"]);
    const datosInicialesRows = getSheetRows(
      sheetMap,
      "DATOS_INICIALES_SOLICITUD",
      [
        "datos_iniciales_solicitud",
        "datos_iniciales",
        "Datos_Iniciales_Solicitud",
      ],
    );

    const parsedProcesos = procesosRows.map(parseProceso);
    const parsedActividades = actividadesRows.map(parseActividad);
    const parsedAdjuntos = adjuntosRows.map(parseAdjunto);
    const parsedActores = actoresRows.map(parseActor);
    const parsedSolicitudes = solicitudesRows.map(parseSolicitud);
    const parsedUsuarios = usuariosRows.map(parseUsuario);
    const parsedRegistros = registrosRows.map(parseRegistro);
    const parsedDatosIniciales = datosInicialesRows.map(parseDatosIniciales);

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
    setSolicitudes(parsedSolicitudes);

    const usersByKey = new Map();
    parsedUsuarios.forEach((user) => {
      const label = user.nombreCompleto || user.correo || `Usuario ${user.id}`;
      usersByKey.set(String(user.id), label);
      if (user.correo) {
        usersByKey.set(user.correo.toLowerCase(), label);
      }
    });

    const initialDataMap = new Map();
    parsedDatosIniciales.forEach((data) => {
      if (!data.idSolicitud) return;
      initialDataMap.set(String(data.idSolicitud), data);
    });

    const solicitudesById = new Map();
    parsedSolicitudes.forEach((solicitud) => {
      solicitudesById.set(String(solicitud.id), solicitud);
    });

    const latestSolicitudByUser = new Map();
    parsedSolicitudes.forEach((solicitud) => {
      const key = String(solicitud.idUsuario);
      const existing = latestSolicitudByUser.get(key);
      if (!existing || idToNumber(solicitud.id) > idToNumber(existing.id)) {
        latestSolicitudByUser.set(key, solicitud);
      }
    });

    const recordList = parsedRegistros
      .map((registro) => {
        const linkedSolicitud =
          solicitudesById.get(String(registro.idSolicitud)) ||
          latestSolicitudByUser.get(String(registro.idUsuario)) ||
          null;
        const initialData = linkedSolicitud
          ? initialDataMap.get(String(linkedSolicitud.id))
          : initialDataMap.get(String(registro.idSolicitud));

        return {
          ...registro,
          dateLabel: formatDate(registro.timestamp),
          userLabel:
            initialData?.nombre ||
            usersByKey.get(String(registro.idUsuario)) ||
            usersByKey.get(String(registro.idUsuario).toLowerCase()) ||
            registro.idUsuario ||
            "Sin usuario",
          solicitudId: linkedSolicitud?.id ?? registro.idSolicitud ?? null,
          idProceso: linkedSolicitud?.idProceso ?? "",
          solicitudActividadActual: linkedSolicitud?.actividadActual ?? null,
          solicitudFecha: linkedSolicitud?.fecha ?? null,
        };
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    setUserLabels(usersByKey);
    setInitialDataBySolicitud(initialDataMap);
    setRecords(recordList);
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const sheetMap = await apiGetAllSheets(auth.token);
      hydrateDashboard(sheetMap);
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
      setSolicitudes([]);
      setRecords([]);
      setInitialDataBySolicitud(new Map());
      setUserLabels(new Map());
      setError("No se pudo cargar la informacion del dashboard.");
    }

    setLoading(false);
  }, [auth.token, hydrateDashboard, logout, navigate]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      await Promise.resolve();
      if (active) {
        await loadDashboard();
      }
    };

    run();

    return () => {
      active = false;
    };
  }, [loadDashboard]);

  const processTotals = useMemo(() => {
    const counts = new Map();
    solicitudes.forEach((solicitud) => {
      const key = String(solicitud.idProceso ?? "");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return processes.map((process) => ({
      ...process,
      solicitudCount: counts.get(String(process.id)) ?? 0,
    }));
  }, [processes, solicitudes]);

  const firstProcessLabel = processes[0]?.nombre ?? "Proceso";
  const firstActivityLabel = firstActivity?.nombre ?? "Actividad inicial";

  const groupedRecords = useMemo(() => {
    const solicitudCountByProcess = new Map();
    const solicitudCountByActivity = new Map();

    solicitudes.forEach((solicitud) => {
      const processKey = String(solicitud.idProceso ?? "");
      solicitudCountByProcess.set(
        processKey,
        (solicitudCountByProcess.get(processKey) ?? 0) + 1,
      );

      const activityKey = String(solicitud.actividadActual ?? "");
      if (activityKey) {
        solicitudCountByActivity.set(
          activityKey,
          (solicitudCountByActivity.get(activityKey) ?? 0) + 1,
        );
      }
    });

    return processes.map((process) => {
      const processActivities =
        activitiesByProcess.get(String(process.id)) ?? [];

      return {
        ...process,
        solicitudCount: solicitudCountByProcess.get(String(process.id)) ?? 0,
        activities: processActivities.map((activity) => {
          const items = records
            .filter(
              (record) =>
                String(record.idProceso) === String(process.id) &&
                matchesActivity(record.idActividad, activity),
            )
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

          const activityCount =
            solicitudCountByActivity.get(String(activity.id)) ??
            solicitudCountByActivity.get(String(activity.orden)) ??
            0;

          return {
            ...activity,
            solicitudCount: activityCount,
            items,
          };
        }),
      };
    });
  }, [activitiesByProcess, processes, records, solicitudes]);

  const groupedSolicitudes = useMemo(() => {
    return processes.map((process) => {
      const processActivities =
        activitiesByProcess.get(String(process.id)) ?? [];
      const processSolicitudes = solicitudes.filter(
        (solicitud) => String(solicitud.idProceso) === String(process.id),
      );

      const items = processSolicitudes
        .map((solicitud) => {
          const currentActivity =
            resolveActivity(processActivities, solicitud.actividadActual) ??
            processActivities[0] ??
            null;
          const initialData = initialDataBySolicitud.get(String(solicitud.id));
          return {
            ...solicitud,
            userLabel: resolveSolicitudLabel(solicitud),
            currentActivity,
            currentOrder: currentActivity?.orden ?? 0,
            initialData,
          };
        })
        .sort((a, b) => {
          const diff = Number(a.currentOrder) - Number(b.currentOrder);
          if (diff !== 0) return diff;
          return idToNumber(a.id) - idToNumber(b.id);
        });

      return {
        ...process,
        solicitudCount: processSolicitudes.length,
        items,
      };
    });
  }, [
    activitiesByProcess,
    initialDataBySolicitud,
    processes,
    resolveSolicitudLabel,
    solicitudes,
  ]);

  const buildFlow = useCallback((processActivities, flowRecords) => {
    return processActivities.map((activity) => {
      const matching = flowRecords
        .filter((item) => matchesActivity(item.idActividad, activity))
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];

      return { activity, registro: matching ?? null };
    });
  }, []);

  const openFlowForSolicitud = useCallback(
    (solicitud) => {
      if (!solicitud) return;
      const processActivities =
        activitiesByProcess.get(String(solicitud.idProceso)) ?? [];
      const flowRecords = recordsBySolicitud.get(String(solicitud.id)) ?? [];
      const flow = buildFlow(processActivities, flowRecords);
      setActivityForms({});
      setModalMessage("");
      setModalMessageType("");
      setSubmittingActivity("");
      setSelectedSolicitud({
        ...solicitud,
        userLabel: resolveSolicitudLabel(solicitud),
      });
      setSelectedFlow(flow);
    },
    [activitiesByProcess, buildFlow, recordsBySolicitud, resolveSolicitudLabel],
  );

  const openFlowForRecord = useCallback(
    (record) => {
      if (!record) return;
      const solicitudId = String(
        record.solicitudId ?? record.idSolicitud ?? "",
      );
      const solicitud = solicitudesById.get(solicitudId) ?? {
        id: solicitudId || record.id,
        idUsuario: record.idUsuario,
        idProceso: record.idProceso,
        actividadActual:
          record.solicitudActividadActual ?? record.idActividad ?? "",
        fecha: record.solicitudFecha ?? record.timestamp ?? "",
      };

      openFlowForSolicitud(solicitud);
    },
    [openFlowForSolicitud, solicitudesById],
  );

  const closeFlow = () => {
    setSelectedSolicitud(null);
    setSelectedFlow([]);
    setActivityForms({});
    setModalMessage("");
    setModalMessageType("");
    setSubmittingActivity("");
  };

  const isInitialStep = useCallback(
    (activity, solicitud) => {
      if (!activity || !solicitud || !firstActivity || !firstProcessId) {
        return false;
      }
      return (
        String(solicitud.idProceso) === String(firstProcessId) &&
        String(activity.id) === String(firstActivity.id)
      );
    },
    [firstActivity, firstProcessId],
  );

  const handleActivityFormChange = useCallback((activityId, field, value) => {
    setActivityForms((prev) => {
      const key = String(activityId);
      const current = prev[key] ?? {};
      return {
        ...prev,
        [key]: {
          ...current,
          [field]: value,
        },
      };
    });
  }, []);

  const handleStartFormChange = (event) => {
    const { name, value } = event.target;
    setStartForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleStartProcess = async (event) => {
    event.preventDefault();
    setStartMessage("");
    setStartMessageType("");

    if (!firstProcessId || !firstActivity) {
      setStartMessage("No hay procesos o actividades configuradas.");
      setStartMessageType("error");
      return;
    }

    const nombre = startForm.nombre.trim();
    const correo = startForm.correo.trim();
    const observacion = startForm.observacion.trim();
    const urlDocumento = startForm.urlDocumento.trim();

    if (!nombre || !correo) {
      setStartMessage("Debes indicar nombre y correo para iniciar el proceso.");
      setStartMessageType("error");
      return;
    }

    if (!observacion) {
      setStartMessage(
        "Debes escribir una observacion para registrar la primera actividad.",
      );
      setStartMessageType("error");
      return;
    }

    setStartLoading(true);
    try {
      const sheetMap = await apiGetAllSheets(auth.token);
      const usersRows = getSheetRows(sheetMap, "USUARIOS", ["usuarios"]);
      const solicitudesRows = getSheetRows(sheetMap, "SOLICITUDES", [
        "solicitudes",
      ]);
      const registrosRows = getSheetRows(sheetMap, "REGISTROS", ["registros"]);
      const datosInicialesRows = getSheetRows(
        sheetMap,
        "DATOS_INICIALES_SOLICITUD",
        [
          "datos_iniciales_solicitud",
          "datos_iniciales",
          "Datos_Iniciales_Solicitud",
        ],
      );

      let currentUser = findUserByEmail(usersRows, correo);
      if (!currentUser) {
        const nextUserId = getNextId(usersRows);
        const { nombres, apellidos } = splitUserName(nombre);

        await apiPost(
          "/api/sheets/USUARIOS/rows",
          {
            values: [nextUserId, correo, nombres, apellidos, ""],
            userEmailColumnIndex: 1,
          },
          auth.token,
        );

        currentUser = {
          id: nextUserId,
          correo,
          nombreCompleto: nombre,
          rol: "",
        };
      }

      const nextSolicitudId = getNextId(solicitudesRows);
      const currentDate = new Date().toISOString().slice(0, 10);
      await apiPost(
        "/api/sheets/SOLICITUDES/rows",
        {
          values: [
            nextSolicitudId,
            String(currentUser.id),
            String(firstProcessId),
            String(firstActivity.id),
            currentDate,
          ],
        },
        auth.token,
      );

      const nextRegistroId = getNextId(registrosRows);
      const currentTimestamp = new Date().toISOString();
      await apiPost(
        "/api/sheets/REGISTROS/rows",
        {
          values: [
            nextRegistroId,
            String(currentUser.id),
            String(firstActivity.id),
            String(nextSolicitudId),
            currentTimestamp,
            observacion,
            true,
            urlDocumento,
          ],
        },
        auth.token,
      );

      const nextDatosId = getNextId(datosInicialesRows);
      await apiPost(
        "/api/sheets/DATOS_INICIALES_SOLICITUD/rows",
        {
          values: [nextDatosId, String(nextSolicitudId), nombre, correo],
        },
        auth.token,
      );

      const refreshSheetMap = await apiGetAllSheets(auth.token);
      hydrateDashboard(refreshSheetMap);
      setStartForm({
        nombre: "",
        correo: "",
        observacion: "",
        urlDocumento: "",
      });
      setStartMessage("Solicitud iniciada correctamente.");
      setStartMessageType("info");
    } catch (submitError) {
      if (isUnauthorizedError(submitError)) {
        logout();
        navigate("/login", { replace: true });
        return;
      }

      const message =
        submitError?.response?.data?.message ||
        "No se pudo iniciar el proceso.";
      setStartMessage(message);
      setStartMessageType("error");
    } finally {
      setStartLoading(false);
    }
  };

  const approveRecord = async (record) => {
    const solicitudId = record?.solicitudId ?? record?.idSolicitud;
    if (!solicitudId || !record?.idActividad) return;
    const fecha = new Date().toISOString().slice(0, 10);

    await apiPatch(
      `/api/sheets/registros/${solicitudId}/actividades/${record.idActividad}/aprobado`,
      { aprobado: true },
      auth.token,
    );

    await apiPatch(
      `/api/sheets/solicitudes/${solicitudId}/actividad`,
      { actividad_actual: record.idActividad, fecha },
      auth.token,
    );

    const sheetMap = await apiGetAllSheets(auth.token);
    hydrateDashboard(sheetMap);

    if (
      selectedSolicitud &&
      String(selectedSolicitud.id) === String(solicitudId)
    ) {
      openFlowForSolicitud({
        ...selectedSolicitud,
        actividadActual: record.idActividad,
      });
    }
  };

  const completeActivity = async (activity) => {
    if (!selectedSolicitud || !activity) return;
    const key = String(activity.id);
    const formValues = activityForms[key] ?? {};
    const observacion = String(formValues.observacion ?? "").trim();
    const urlDocumento = String(formValues.urlDocumento ?? "").trim();
    const needsInitialData = isInitialStep(activity, selectedSolicitud);
    const nombre = String(formValues.nombre ?? "").trim();
    const correo = String(formValues.correo ?? "").trim();

    if (!observacion) {
      setModalMessage("Debes escribir una observacion para completar el paso.");
      setModalMessageType("error");
      return;
    }

    if (needsInitialData && (!nombre || !correo)) {
      setModalMessage("Debes completar nombre y correo en este paso.");
      setModalMessageType("error");
      return;
    }

    const existing = (
      recordsBySolicitud.get(String(selectedSolicitud.id)) ?? []
    ).find((item) => matchesActivity(item.idActividad, activity));
    if (existing) {
      setModalMessage("Ya existe un registro para esta actividad.");
      setModalMessageType("error");
      return;
    }

    setSubmittingActivity(key);
    setModalMessage("");
    setModalMessageType("");
    try {
      const sheetMap = await apiGetAllSheets(auth.token);
      const registrosRows = getSheetRows(sheetMap, "REGISTROS", ["registros"]);
      const datosInicialesRows = getSheetRows(
        sheetMap,
        "DATOS_INICIALES_SOLICITUD",
        ["datos_iniciales_solicitud", "datos_iniciales"],
      );

      const nextRegistroId = getNextId(registrosRows);
      const timestamp = new Date().toISOString();
      await apiPost(
        "/api/sheets/REGISTROS/rows",
        {
          values: [
            nextRegistroId,
            String(selectedSolicitud.idUsuario ?? ""),
            String(activity.id),
            String(selectedSolicitud.id),
            timestamp,
            observacion,
            true,
            urlDocumento,
          ],
        },
        auth.token,
      );

      const fecha = new Date().toISOString().slice(0, 10);
      await apiPatch(
        `/api/sheets/solicitudes/${selectedSolicitud.id}/actividad`,
        { actividad_actual: String(activity.id), fecha },
        auth.token,
      );

      if (needsInitialData) {
        const parsedDatosIniciales =
          datosInicialesRows.map(parseDatosIniciales);
        const existingInitial = parsedDatosIniciales.find(
          (data) => String(data.idSolicitud) === String(selectedSolicitud.id),
        );
        if (!existingInitial) {
          const nextDatosId = getNextId(datosInicialesRows);
          await apiPost(
            "/api/sheets/DATOS_INICIALES_SOLICITUD/rows",
            {
              values: [
                nextDatosId,
                String(selectedSolicitud.id),
                nombre,
                correo,
              ],
            },
            auth.token,
          );
        }
      }

      const refreshSheetMap = await apiGetAllSheets(auth.token);
      hydrateDashboard(refreshSheetMap);
      setModalMessage("Actividad registrada correctamente.");
      setModalMessageType("info");

      const refreshedSolicitudes = getSheetRows(
        refreshSheetMap,
        "SOLICITUDES",
        ["solicitudes"],
      ).map(parseSolicitud);
      const refreshedSolicitud = refreshedSolicitudes.find(
        (solicitud) => String(solicitud.id) === String(selectedSolicitud.id),
      ) ?? {
        ...selectedSolicitud,
        actividadActual: String(activity.id),
      };
      const refreshedRegistros = getSheetRows(refreshSheetMap, "REGISTROS", [
        "registros",
      ]).map(parseRegistro);
      const flowRecords = refreshedRegistros.filter(
        (item) => String(item.idSolicitud) === String(refreshedSolicitud.id),
      );
      const processActivities =
        activitiesByProcess.get(String(refreshedSolicitud.idProceso)) ?? [];
      setSelectedSolicitud({
        ...refreshedSolicitud,
        userLabel: resolveSolicitudLabel(refreshedSolicitud),
      });
      setSelectedFlow(buildFlow(processActivities, flowRecords));
      setActivityForms((prev) => ({
        ...prev,
        [key]: {
          observacion: "",
          urlDocumento: "",
          nombre: "",
          correo: "",
        },
      }));
    } catch (submitError) {
      if (isUnauthorizedError(submitError)) {
        logout();
        navigate("/login", { replace: true });
        return;
      }

      const message =
        submitError?.response?.data?.message ||
        "No se pudo completar la actividad.";
      setModalMessage(message);
      setModalMessageType("error");
    } finally {
      setSubmittingActivity("");
    }
  };

  return (
    <section className="admin-page">
      <div className="page-intro">
        <h2>Dashboard Administrativo</h2>
        <p>
          Solicitudes por proceso con control de aprobacion y seguimiento de
          actividades.
        </p>
      </div>

      <div className="admin-controls">
        <div className="admin-view-switch">
          <span>Vista:</span>
          <label htmlFor="viewSteps">
            <input
              id="viewSteps"
              type="radio"
              name="viewMode"
              value="steps"
              checked={viewMode === "steps"}
              onChange={() => setViewMode("steps")}
            />
            Vista por pasos
          </label>
          <label htmlFor="viewRequest">
            <input
              id="viewRequest"
              type="radio"
              name="viewMode"
              value="solicitud"
              checked={viewMode === "solicitud"}
              onChange={() => setViewMode("solicitud")}
            />
            Vista por solicitud
          </label>
        </div>

        {isAdmin ? (
          <div className="admin-start">
            <button
              type="button"
              className="start-process-btn"
              onClick={() => setShowStartForm((prev) => !prev)}
            >
              {showStartForm ? "Ocultar formulario" : "Empezar proceso"}
            </button>

            {showStartForm ? (
              <form className="admin-start-form" onSubmit={handleStartProcess}>
                <div className="admin-start-meta">
                  <p>
                    <strong>Proceso:</strong> {firstProcessLabel}
                  </p>
                  <p>
                    <strong>Actividad inicial:</strong> {firstActivityLabel}
                  </p>
                </div>

                <label htmlFor="startNombre">Nombre</label>
                <input
                  id="startNombre"
                  name="nombre"
                  type="text"
                  value={startForm.nombre}
                  onChange={handleStartFormChange}
                  required
                />

                <label htmlFor="startCorreo">Correo</label>
                <input
                  id="startCorreo"
                  name="correo"
                  type="email"
                  value={startForm.correo}
                  onChange={handleStartFormChange}
                  required
                />

                <label htmlFor="startObservacion">Observacion inicial</label>
                <textarea
                  id="startObservacion"
                  name="observacion"
                  rows={3}
                  value={startForm.observacion}
                  onChange={handleStartFormChange}
                />

                <label htmlFor="startUrl">URL del documento</label>
                <input
                  id="startUrl"
                  name="urlDocumento"
                  type="url"
                  value={startForm.urlDocumento}
                  onChange={handleStartFormChange}
                />

                <button type="submit" disabled={startLoading}>
                  {startLoading ? "Guardando..." : "Crear solicitud"}
                </button>
              </form>
            ) : null}

            {startMessage ? (
              <p className={`message ${startMessageType || "info"}`}>
                {startMessage}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {processTotals.length > 0 ? (
        <div className="admin-kpis">
          {processTotals.map((process) => (
            <article key={process.id}>
              <span>{process.nombre}</span>
              <strong>{process.solicitudCount}</strong>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state">No hay procesos configurados.</p>
      )}

      {error ? <p className="message error">{error}</p> : null}

      {loading ? (
        <div className="page-state">
          <p>Cargando dashboard...</p>
        </div>
      ) : viewMode === "steps" ? (
        <div className="admin-groups">
          {groupedSolicitudes.length === 0 ? (
            <p className="empty-state">No hay procesos configurados.</p>
          ) : (
            groupedSolicitudes.map((group) => (
              <details key={group.id} className="admin-group" open={false}>
                <summary>
                  <span>{group.nombre}</span>
                  <span className="badge-count">
                    {group.solicitudCount} solicitudes
                  </span>
                </summary>

                <div className="admin-items">
                  {group.items.length === 0 ? (
                    <p className="empty-state">
                      No hay solicitudes activas en este proceso.
                    </p>
                  ) : (
                    <div className="admin-records">
                      {group.items.map((solicitud) => (
                        <article
                          key={solicitud.id}
                          className="admin-record-item"
                        >
                          <button
                            type="button"
                            className="admin-record-link"
                            onClick={() => openFlowForSolicitud(solicitud)}
                          >
                            <span className="record-id">{solicitud.id}</span>
                            <span className="record-date">
                              {formatDate(solicitud.fecha)}
                            </span>
                            <span className="record-user">
                              {solicitud.userLabel}
                            </span>
                          </button>

                          <div className="admin-step-tag">
                            {solicitud.currentActivity
                              ? `Paso ${solicitud.currentActivity.orden}`
                              : "Sin actividad"}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </details>
            ))
          )}
        </div>
      ) : (
        <div className="admin-groups">
          {groupedRecords.length === 0 ? (
            <p className="empty-state">No hay procesos configurados.</p>
          ) : (
            groupedRecords.map((group) => (
              <details key={group.id} className="admin-group" open={false}>
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
                      <details key={activity.id} className="admin-group">
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
                                  onClick={() => openFlowForRecord(record)}
                                >
                                  <span className="record-id">{record.id}</span>
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
                                      "true"
                                    }
                                    onClick={() => approveRecord(record)}
                                  >
                                    {String(record.aprobado).toLowerCase() ===
                                    "true"
                                      ? "Aprobado"
                                      : "Aprobar"}
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

      {selectedSolicitud ? (
        <div className="modal-backdrop" onClick={closeFlow}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Linea de tiempo de solicitud</h3>
                <p>
                  Solicitud: {selectedSolicitud.id} |{" "}
                  {selectedSolicitud.userLabel}
                </p>
              </div>
              <button type="button" className="modal-close" onClick={closeFlow}>
                Cerrar
              </button>
            </div>
            <div className="modal-body">
              {modalMessage ? (
                <p className={`message ${modalMessageType || "info"}`}>
                  {modalMessage}
                </p>
              ) : null}
              <div className="timeline">
                {selectedFlow.map(({ activity, registro }, index) => {
                  const sideClass = index % 2 === 0 ? "left" : "right";
                  const actorNames = (
                    actorsByActivity.get(String(activity.id)) ?? []
                  )
                    .map((actor) => actor.nombre)
                    .filter(Boolean);
                  const attachmentNames = (
                    attachmentsByActivity.get(String(activity.id)) ?? []
                  )
                    .map((adjunto) => adjunto.nombre)
                    .filter(Boolean);
                  const isInitial = isInitialStep(activity, selectedSolicitud);
                  const initialData = initialDataBySolicitud.get(
                    String(selectedSolicitud.id),
                  );
                  const formKey = String(activity.id);
                  const formValues = activityForms[formKey] ?? {};
                  const nombreValue =
                    formValues.nombre ?? initialData?.nombre ?? "";
                  const correoValue =
                    formValues.correo ?? initialData?.correo ?? "";
                  const isSubmitting = submittingActivity === formKey;

                  return (
                    <article
                      key={`${activity.id}-${index}`}
                      className={`timeline-item ${sideClass} enabled`}
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
                            Tiempo maximo:{" "}
                            <strong>{activity.tiempoMax} dias</strong>
                          </p>
                        ) : null}
                        {attachmentNames.length > 0 ? (
                          <p className="timeline-meta">
                            Adjuntos:{" "}
                            <strong>{attachmentNames.join(", ")}</strong>
                          </p>
                        ) : null}
                        {registro ? (
                          <div className="request-summary">
                            <p>
                              <strong>Fecha:</strong>{" "}
                              {formatDate(registro.timestamp)}
                            </p>
                            <p>
                              <strong>Observacion:</strong>{" "}
                              {registro.observacion || "-"}
                            </p>
                            <p>
                              <strong>Aprobado:</strong>{" "}
                              {String(registro.aprobado).toLowerCase() ===
                              "true"
                                ? "Si"
                                : "No"}
                            </p>
                            {isInitial &&
                            (initialData?.nombre || initialData?.correo) ? (
                              <>
                                <p>
                                  <strong>Nombre:</strong>{" "}
                                  {initialData?.nombre || "-"}
                                </p>
                                <p>
                                  <strong>Correo:</strong>{" "}
                                  {initialData?.correo || "-"}
                                </p>
                              </>
                            ) : null}
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
                            {isAdmin &&
                            String(registro.aprobado).toLowerCase() !==
                              "true" ? (
                              <button
                                type="button"
                                className="record-approve-btn"
                                onClick={() => approveRecord(registro)}
                              >
                                Aprobar
                              </button>
                            ) : null}
                          </div>
                        ) : isAdmin ? (
                          <form
                            className="request-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              completeActivity(activity);
                            }}
                          >
                            {isInitial ? (
                              <>
                                <label htmlFor={`nombre-${formKey}`}>
                                  Nombre
                                </label>
                                <input
                                  id={`nombre-${formKey}`}
                                  value={nombreValue}
                                  onChange={(event) =>
                                    handleActivityFormChange(
                                      formKey,
                                      "nombre",
                                      event.target.value,
                                    )
                                  }
                                  required
                                />

                                <label htmlFor={`correo-${formKey}`}>
                                  Correo
                                </label>
                                <input
                                  id={`correo-${formKey}`}
                                  type="email"
                                  value={correoValue}
                                  onChange={(event) =>
                                    handleActivityFormChange(
                                      formKey,
                                      "correo",
                                      event.target.value,
                                    )
                                  }
                                  required
                                />
                              </>
                            ) : null}

                            <label htmlFor={`observacion-${formKey}`}>
                              Observacion de la actividad
                            </label>
                            <textarea
                              id={`observacion-${formKey}`}
                              rows={3}
                              value={formValues.observacion ?? ""}
                              onChange={(event) =>
                                handleActivityFormChange(
                                  formKey,
                                  "observacion",
                                  event.target.value,
                                )
                              }
                            />

                            <label htmlFor={`url-${formKey}`}>
                              URL del documento
                            </label>
                            <input
                              id={`url-${formKey}`}
                              type="url"
                              value={formValues.urlDocumento ?? ""}
                              onChange={(event) =>
                                handleActivityFormChange(
                                  formKey,
                                  "urlDocumento",
                                  event.target.value,
                                )
                              }
                            />

                            <button type="submit" disabled={isSubmitting}>
                              {isSubmitting ? "Guardando..." : "Completar paso"}
                            </button>
                          </form>
                        ) : (
                          <p className="disabled-note">
                            No hay registro en esta actividad.
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default AdminDashboard;
