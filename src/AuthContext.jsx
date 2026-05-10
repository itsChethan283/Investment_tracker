import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    // Handle PKCE code exchange (e.g. password reset link with ?code=...)
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    const init = async () => {
      if (code) {
        // Exchange code for session — this triggers onAuthStateChange with PASSWORD_RECOVERY
        await supabase.auth.exchangeCodeForSession(code);
        // Clean the URL
        window.history.replaceState({}, "", window.location.pathname);
      }

      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setLoading(false);
    };

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });

    init();

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setIsRecovery(false);
  };

  const clearRecovery = () => setIsRecovery(false);

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut, isRecovery, clearRecovery }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
