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
  businessId: string | null;
  profile: UserProfile;
  // True when the user must set a real password before they can use the app.
  // Driven by the `users.must_change_password` flag (set by the invite flow).
  // Also true when the user is in a password-recovery session.
  mustChangePassword: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateProfile: (fullName: string) => Promise<{ error: string | null }>;
  signInWithOAuth: (provider: "apple" | "github") => Promise<{ error: string | null }>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  // Clear the must_change_password flag after a successful change.
  clearMustChangePassword: () => Promise<void>;
}

const AuthCtx = createContext<AuthContext | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile>({ fullName: null, email: null, role: null });
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Initial session check (page load / refresh).
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) fetchUserData(s.user.id, s.user.email ?? null);
      else setIsLoading(false);
    });

    // Single listener for all auth state transitions. We only refetch profile
    // data on events that change WHO is logged in — TOKEN_REFRESHED fires every
    // ~50 min with the same user and shouldn't trigger a profile re-fetch.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);

      // PASSWORD_RECOVERY fires when the user lands on the app via a reset
      // email link. They have a session but must set a new password before
      // doing anything else. We route them and set the must-change flag.
      if (event === "PASSWORD_RECOVERY") {
        setMustChangePassword(true);
        // Defensive: if the user landed somewhere other than /reset-password,
        // bounce them there. Doesn't fire if they're already on /reset-password.
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/reset-password")) {
          window.location.replace("/reset-password");
        }
        return;
      }

      if (event === "SIGNED_OUT" || !s?.user) {
        setBusinessId(null);
        setProfile({ fullName: null, email: null, role: null });
        setMustChangePassword(false);
        setIsLoading(false);
        return;
      }

      // Only refetch on identity changes — initial load, sign-in, or user
      // update. Token refresh keeps the same user and is a no-op here.
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "USER_UPDATED") {
        fetchUserData(s.user.id, s.user.email ?? null);
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchUserData(userId: string, email: string | null) {
    const { data } = await supabase
      .from("users")
      .select("business_id, full_name, role, theme_preference, must_change_password")
      .eq("id", userId)
      .single();
    setBusinessId(data?.business_id ?? null);
    setProfile({
      fullName: data?.full_name ?? null,
      email,
      role: data?.role ?? null,
    });
    setMustChangePassword(!!data?.must_change_password);
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
    setBusinessId(null);
    setProfile({ fullName: null, email: null, role: null });
    setMustChangePassword(false);
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

  async function signInWithOAuth(provider: "apple" | "github") {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/` },
    });
    return { error: error?.message ?? null };
  }

  async function requestPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error?.message ?? null };
  }

  async function updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error?.message ?? null };
  }

  async function clearMustChangePassword() {
    if (!user) return;
    await supabase
      .from("users")
      .update({ must_change_password: false })
      .eq("id", user.id);
    setMustChangePassword(false);
  }

  return (
    <AuthCtx.Provider
      value={{
        user, session, isLoading, businessId, profile, mustChangePassword,
        signIn, signOut, updateProfile,
        signInWithOAuth, requestPasswordReset, updatePassword,
        clearMustChangePassword,
      }}
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
