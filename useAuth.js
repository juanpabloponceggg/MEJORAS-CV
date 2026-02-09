import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const initialLoad = useRef(true);

  // ─── Cargar perfil del usuario ───
  const fetchPerfil = useCallback(async (userId) => {
    try {
      const { data, error: err } = await supabase
        .from("perfiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (err) {
        console.error("Error al cargar perfil:", err.message);
        setError("No se encontró tu perfil. Contacta al administrador.");
        setPerfil(null);
        return null;
      }

      if (!data.activo) {
        setError("Tu cuenta está desactivada.");
        setPerfil(null);
        return null;
      }

      setPerfil(data);
      setError(null);
      return data;
    } catch (e) {
      console.error("Error fetchPerfil:", e);
      setPerfil(null);
      return null;
    }
  }, []);

  // ─── Inicializar sesión UNA sola vez ───
  useEffect(() => {
    // Timeout de seguridad — NUNCA quedarse en "cargando" más de 5 segundos
    const safety = setTimeout(() => setLoading(false), 5000);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        await fetchPerfil(session.user.id);
      }
      initialLoad.current = false;
      setLoading(false);
      clearTimeout(safety);
    }).catch(() => {
      initialLoad.current = false;
      setLoading(false);
      clearTimeout(safety);
    });

    // Listener SOLO para cambios DESPUÉS del load inicial
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // PASSWORD_RECOVERY siempre se procesa (viene del link del email)
        if (event === "PASSWORD_RECOVERY" && session?.user) {
          setUser(session.user);
          await fetchPerfil(session.user.id);
          setPasswordRecovery(true);
          setLoading(false);
          return;
        }

        // Ignorar el evento inicial — ya lo maneja getSession arriba
        if (initialLoad.current) return;

        if (event === "SIGNED_IN" && session?.user) {
          setUser(session.user);
          await fetchPerfil(session.user.id);
        } else if (event === "SIGNED_OUT") {
          setUser(null);
          setPerfil(null);
        } else if (event === "TOKEN_REFRESHED" && session?.user) {
          setUser(session.user);
        }
      }
    );

    return () => {
      clearTimeout(safety);
      subscription.unsubscribe();
    };
  }, [fetchPerfil]);

  // ─── Login ───
  const login = async (email, password) => {
    setError(null);
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (err) {
        if (err.message.includes("Invalid login")) {
          setError("Email o contraseña incorrectos");
        } else {
          setError(err.message);
        }
        return { success: false, error: err.message };
      }

      setUser(data.user);
      const p = await fetchPerfil(data.user.id);
      return { success: !!p, perfil: p };
    } catch (e) {
      setError("Error de conexión. Intenta de nuevo.");
      return { success: false, error: e.message };
    }
  };

  // ─── Logout ───
  const logout = async () => {
    setUser(null);
    setPerfil(null);
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Error logout:", e);
    }
  };

  // ─── Reset password (enviar email) ───
  const resetPassword = async (email) => {
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://dashboard-cv.vercel.app",
    });
    if (err) return { success: false, error: err.message };
    return { success: true };
  };

  // ─── Update password (nueva contraseña) ───
  const updatePassword = async (newPassword) => {
    const { error: err } = await supabase.auth.updateUser({ password: newPassword });
    if (err) return { success: false, error: err.message };
    setPasswordRecovery(false);
    return { success: true };
  };

  // ─── Create user (admin only) ───
  const createUser = async ({ email, password, nombre, rol, ejecutivo_id }) => {
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nombre_display: nombre, rol },
      },
    });

    if (err) return { success: false, error: err.message };

    if (rol === "ejecutivo" && ejecutivo_id) {
      await supabase
        .from("perfiles")
        .update({ ejecutivo_id, rol: "ejecutivo" })
        .eq("user_id", data.user.id);
    }

    if (rol === "admin") {
      await supabase
        .from("perfiles")
        .update({ rol: "admin" })
        .eq("user_id", data.user.id);
    }

    return { success: true, user: data.user };
  };

  return {
    user,
    perfil,
    loading,
    error,
    passwordRecovery,
    isAdmin: perfil?.rol === "admin",
    isEjecutivo: perfil?.rol === "ejecutivo",
    ejecutivoId: perfil?.ejecutivo_id,
    nombreDisplay: perfil?.nombre_display || "",
    login,
    logout,
    resetPassword,
    updatePassword,
    createUser,
  };
}
