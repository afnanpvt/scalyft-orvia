import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export interface UserProfile {
  fullName: string | null;
  email: string | null;
  role: string | null;
}

export interface AuthContext {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  clinicId: string | null;
  profile: UserProfile;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateProfile: (fullName: string) => Promise<{ error: string | null }>;
}

const AuthCtx = createContext<AuthContext | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile>({ fullName: null, email: null, role: null });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) fetchUserData(s.user.id, s.user.email ?? null);
      else setIsLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) fetchUserData(s.user.id, s.user.email ?? null);
      else {
        setClinicId(null);
        setProfile({ fullName: null, email: null, role: null });
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchUserData(userId: string, email: string | null) {
    const { data } = await supabase
      .from("users")
      .select("clinic_id, full_name, role, theme_preference")
      .eq("id", userId)
      .single();
    setClinicId(data?.clinic_id ?? null);
    setProfile({
      fullName: data?.full_name ?? null,
      email,
      role: data?.role ?? null,
    });
    // Apply saved theme preference
    if (data?.theme_preference) {
      localStorage.setItem("orvia-theme", data.theme_preference);
      const resolved = data.theme_preference === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : data.theme_preference;
      document.documentElement.classList.toggle("dark", resolved === "dark");
    }
    setIsLoading(false);
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setClinicId(null);
    setProfile({ fullName: null, email: null, role: null });
  }

  async function updateProfile(fullName: string) {
    if (!user) return { error: "Not authenticated" };
    const { error } = await supabase
      .from("users")
      .update({ full_name: fullName })
      .eq("id", user.id);
    if (!error) {
      setProfile((prev) => ({ ...prev, fullName }));
    }
    return { error: error?.message ?? null };
  }

  return (
    <AuthCtx.Provider
      value={{ user, session, isLoading, clinicId, profile, signIn, signOut, updateProfile }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
