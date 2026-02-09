import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

export function useExecutives({ mes, anio }) {
  const [ejecutivos, setEjecutivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchEjecutivos = useCallback(async (retryCount = 0) => {
    setLoading(true);
    try {
      // 1. Traer todos los perfiles de ejecutivos registrados
      const { data: perfilesData, error: pErr } = await supabase
        .from("perfiles")
        .select("nombre_display")
        .eq("rol", "ejecutivo")
        .eq("activo", true);

      if (pErr) throw pErr;

      const nombresRegistrados = (perfilesData || []).map((p) => p.nombre_display);

      // 2. Traer ejecutivos del mes/año actual
      const { data: ejData, error: ejErr } = await supabase
        .from("ejecutivos")
        .select("*")
        .eq("mes", mes)
        .eq("anio", anio)
        .order("id");

      if (ejErr) throw ejErr;

      // 3. Para cada perfil registrado, verificar si tiene fila en ejecutivos para este mes
      const existentes = new Set((ejData || []).map((e) => e.nombre));
      const faltantes = nombresRegistrados.filter((n) => !existentes.has(n));

      // 4. Auto-crear filas para ejecutivos que no tienen registro este mes
      if (faltantes.length > 0) {
        const nuevos = faltantes.map((nombre) => ({
          nombre,
          tipo: "nómina",
          meta: 0,
          activo: true,
          mes,
          anio,
        }));

        const { error: insertErr } = await supabase
          .from("ejecutivos")
          .insert(nuevos);

        if (insertErr) throw insertErr;

        // Recargar después de insertar
        const { data: ejData2, error: ejErr2 } = await supabase
          .from("ejecutivos")
          .select("*")
          .eq("mes", mes)
          .eq("anio", anio)
          .order("id");

        if (ejErr2) throw ejErr2;
        setEjecutivos(ejData2 || []);
      } else {
        // Filtrar solo los que tienen cuenta registrada
        const filtered = (ejData || []).filter((e) => nombresRegistrados.includes(e.nombre));
        setEjecutivos(filtered);
      }

      setError(null);
    } catch (err) {
      console.error(`Error al cargar ejecutivos (intento ${retryCount + 1}):`, err);
      // Retry automático (max 2 reintentos con 2s de delay)
      if (retryCount < 2) {
        setTimeout(() => fetchEjecutivos(retryCount + 1), 2000);
        return;
      }
      setError(err.message);
    }
    setLoading(false);
  }, [mes, anio]);

  useEffect(() => {
    fetchEjecutivos();
  }, [fetchEjecutivos]);

  // ─── Actualizar meta de un ejecutivo ───
  const updateMeta = async (ejecutivoId, newMeta) => {
    const { data, error: err } = await supabase
      .from("ejecutivos")
      .update({ meta: newMeta })
      .eq("id", ejecutivoId)
      .select();

    if (err) return { success: false, error: err.message };
    if (!data || data.length === 0) return { success: false, error: "No row updated" };

    setEjecutivos((prev) =>
      prev.map((e) => (e.id === ejecutivoId ? { ...e, meta: newMeta } : e))
    );
    return { success: true };
  };

  // ─── Cambiar tipo (nómina ↔ motos) ───
  const updateTipo = async (ejecutivoId, nuevoTipo) => {
    const { error: err } = await supabase
      .from("ejecutivos")
      .update({ tipo: nuevoTipo })
      .eq("id", ejecutivoId);

    if (err) return { success: false, error: err.message };

    setEjecutivos((prev) =>
      prev.map((e) => (e.id === ejecutivoId ? { ...e, tipo: nuevoTipo } : e))
    );
    return { success: true };
  };

  // ─── Copiar metas del mes anterior ───
  const copyFromPreviousMonth = async () => {
    let prevMes = mes - 1;
    let prevAnio = anio;
    if (prevMes < 1) {
      prevMes = 12;
      prevAnio = anio - 1;
    }

    const { data: prevData, error: err } = await supabase
      .from("ejecutivos")
      .select("*")
      .eq("mes", prevMes)
      .eq("anio", prevAnio);

    if (err) return { success: false, error: err.message };
    if (!prevData || prevData.length === 0)
      return { success: false, error: "No hay datos del mes anterior" };

    const newRecords = prevData.map(({ id, ...rest }) => ({
      ...rest,
      mes,
      anio,
    }));

    const { error: insertErr } = await supabase
      .from("ejecutivos")
      .insert(newRecords);

    if (insertErr) return { success: false, error: insertErr.message };

    await fetchEjecutivos();
    return { success: true };
  };

  // ─── Toggle activo/inactivo ───
  const toggleActivo = async (ejecutivoId, activo) => {
    const { error: err } = await supabase
      .from("ejecutivos")
      .update({ activo })
      .eq("id", ejecutivoId);

    if (err) return { success: false, error: err.message };

    setEjecutivos((prev) =>
      prev.map((e) => (e.id === ejecutivoId ? { ...e, activo } : e))
    );
    return { success: true };
  };

  // ─── Separar nómina y motos ───
  const nominaEjecutivos = ejecutivos.filter((e) => e.tipo === "nómina" || e.tipo === "nomina");
  const motosEjecutivos = ejecutivos.filter((e) => e.tipo === "motos");

  return {
    ejecutivos,
    nominaEjecutivos,
    motosEjecutivos,
    loading,
    error,
    updateMeta,
    updateTipo,
    copyFromPreviousMonth,
    toggleActivo,
    refetch: fetchEjecutivos,
  };
}
