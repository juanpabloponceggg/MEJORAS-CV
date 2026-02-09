import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

export function useClients({ mes, anio, ejecutivoId = null, ejecutivoNombre = null, isAdmin = true }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ─── Cargar clientes filtrados por mes/año (con retry automático) ───
  const fetchClients = useCallback(async (retryCount = 0) => {
    setLoading(true);
    let query = supabase
      .from("clientes")
      .select("*")
      .eq("mes_registro", mes)
      .eq("anio_registro", anio)
      .order("id", { ascending: false });

    // Si es ejecutivo, solo sus clientes (por nombre)
    if (!isAdmin) {
      if (!ejecutivoNombre) {
        // Sin nombre no puede filtrar — no mostrar nada
        setClients([]);
        setError(null);
        setLoading(false);
        return;
      }
      query = query.eq("ejecutivo", ejecutivoNombre);
    }

    const { data, error: err } = await query;

    if (err) {
      console.error(`Error al cargar clientes (intento ${retryCount + 1}):`, err);
      // Retry automático (max 2 reintentos con 2s de delay)
      if (retryCount < 2) {
        setTimeout(() => fetchClients(retryCount + 1), 2000);
        return;
      }
      setError(err.message);
    } else {
      setClients(data || []);
      setError(null);
    }
    setLoading(false);
  }, [mes, anio, ejecutivoNombre, isAdmin]);

  // ─── Cargar al montar y al cambiar filtros ───
  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // ─── Suscripción en tiempo real ───
  useEffect(() => {
    const channel = supabase
      .channel("clientes-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "clientes",
          filter: `anio_registro=eq.${anio}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newClient = payload.new;
            if (newClient.mes_registro === mes) {
              setClients((prev) => [newClient, ...prev]);
            }
          } else if (payload.eventType === "UPDATE") {
            setClients((prev) =>
              prev.map((c) => (c.id === payload.new.id ? payload.new : c))
            );
          } else if (payload.eventType === "DELETE") {
            setClients((prev) => prev.filter((c) => c.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [mes, anio]);

  // ─── Agregar cliente ───
  const addClient = async (clientData) => {
    const { data, error: err } = await supabase
      .from("clientes")
      .insert({
        ...clientData,
        mes_registro: mes,
        anio_registro: anio,
        fecha_inicio: clientData.fecha_inicio || new Date().toISOString().split("T")[0],
      })
      .select()
      .single();

    if (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
    return { success: true, client: data };
  };

  // ─── Actualizar campo de un cliente ───
  const updateClient = async (clientId, field, value) => {
    const { error: err } = await supabase
      .from("clientes")
      .update({ [field]: value })
      .eq("id", clientId);

    if (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
    return { success: true };
  };

  // ─── Insertar registro en historial de estatus ───
  const insertStatusHistory = async (clientId, oldStatus, newStatus, nota, usuario) => {
    const { error: err } = await supabase
      .from("historial_estatus")
      .insert({
        client_id: clientId,
        estatus_anterior: oldStatus || null,
        estatus_nuevo: newStatus,
        nota: nota || "",
        usuario: usuario || "sistema",
      });
    if (err) console.error("Error insertando historial:", err);
  };

  // ─── Actualizar estatus (con historial, fecha_final, estatus_updated_at) ───
  const updateEstatus = async (clientId, nuevoEstatus, actualizacion = "", usuario = "admin") => {
    // Obtener estatus actual para registrar la transición
    const clienteActual = clients.find((c) => c.id === clientId);
    const estatusAnterior = clienteActual?.estatus || null;

    const updates = {
      estatus: nuevoEstatus,
      actualizacion,
      estatus_updated_at: new Date().toISOString(),
    };

    if (nuevoEstatus === "Dispersión" || nuevoEstatus === "Rechazado") {
      updates.fecha_final = new Date().toISOString().split("T")[0];
    }

    const { error: err } = await supabase
      .from("clientes")
      .update(updates)
      .eq("id", clientId);

    if (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }

    // Registrar en historial
    await insertStatusHistory(clientId, estatusAnterior, nuevoEstatus, actualizacion, usuario);

    return { success: true };
  };

  // ─── Obtener historial de estatus de un cliente ───
  const fetchStatusHistory = async (clientId) => {
    const { data, error: err } = await supabase
      .from("historial_estatus")
      .select("*")
      .eq("client_id", clientId)
      .order("fecha_cambio", { ascending: false });

    if (err) {
      console.error("Error cargando historial:", err);
      return [];
    }
    return data || [];
  };

  // ─── Eliminar cliente ───
  const deleteClient = async (clientId) => {
    const { error: err } = await supabase
      .from("clientes")
      .delete()
      .eq("id", clientId);

    if (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
    // Actualizar estado local inmediatamente (realtime también lo hará)
    setClients((prev) => prev.filter((c) => c.id !== clientId));
    return { success: true };
  };

  // ─── Stats calculados ───
  const stats = {
    totalClientes: clients.length,
    enPipeline: clients.filter(
      (c) => !["Dispersión", "Rechazado"].includes(c.estatus)
    ).length,
    dispersiones: clients.filter((c) => c.estatus === "Dispersión"),
    // Nómina: suma montos solo de crédito de nómina dispersados
    totalMontoNomina: clients
      .filter(
        (c) => c.producto === "Crédito de nómina" && c.estatus === "Dispersión"
      )
      .reduce((sum, c) => sum + (c.monto || 0), 0),
    // Motos: cuenta UNIDADES (1 por venta), NO suma pesos
    motosVendidas: clients.filter(
      (c) => c.producto !== "Crédito de nómina" && c.estatus === "Dispersión"
    ).length,
  };

  return {
    clients,
    loading,
    error,
    stats,
    addClient,
    updateClient,
    updateEstatus,
    deleteClient,
    fetchStatusHistory,
    refetch: fetchClients,
  };
}
