import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api, clearTokens, getAccessToken, setTokens } from "@/lib/api";
import { useAuthStore, type AuthGym, type AuthUser } from "@/stores/useAuthStore";
import { queryClient } from "@/lib/queryClient";

// The sync agent now authenticates against cloud via the sk_live_*
// sidecar credential the SidecarAuthProxy persists during login (ADR-008
// §3.3). The desktop no longer relays the operator JWT to the sidecar —
// auth and sync are decoupled at the credential layer.

interface LoginResponse {
  user_id: string;
  full_name: string;
  email: string;
  role: "owner" | "operator";
  gym_id: string;
  gym_name: string | null;
  access_token: string;
  refresh_token: string;
  setup_completed: boolean;
  trial_ends_at: string | null;
  subscription_plan: string;
  subscription_status?: "active" | "past_due" | "cancelled";
  subscription_ends_at?: string | null;
  must_change_password?: boolean;
}

export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);

  return useMutation({
    mutationFn: async (input: { email: string; password: string; remember?: boolean }) => {
      const data = await api.post<LoginResponse>("/api/v1/auth/login", input, { skipAuth: true });
      await setTokens(data.access_token, data.refresh_token);
      const user: AuthUser = {
        user_id: data.user_id,
        full_name: data.full_name,
        email: data.email,
        role: data.role,
      };
      const gym: AuthGym = {
        gym_id: data.gym_id,
        name: data.gym_name,
        setup_completed: data.setup_completed,
        trial_ends_at: data.trial_ends_at,
        subscription_plan: data.subscription_plan,
        subscription_status: data.subscription_status ?? "active",
        subscription_ends_at: data.subscription_ends_at ?? null,
      };
      setSession(user, gym);
      return data;
    },
  });
}

export function useLogout() {
  const navigate = useNavigate();
  const clear = useAuthStore((s) => s.clear);

  return useMutation({
    mutationFn: async () => {
      try {
        await api.post("/api/v1/auth/logout", {});
      } catch {
        // logout offline ok
      }
      await clearTokens();
      clear();
      queryClient.clear();
      navigate("/auth/login", { replace: true });
    },
  });
}

interface SignupResponse {
  user_id: string;
  gym_id: string;
  access_token: string;
  refresh_token: string;
}

interface RedeemInstallerResponse {
  user_id: string;
  gym_id: string;
  full_name: string;
  email: string;
  role: "owner" | "operator";
  gym_name: string | null;
  access_token: string;
  refresh_token: string;
  setup_completed: boolean;
  trial_ends_at: string | null;
  subscription_plan: string;
  subscription_status?: "active" | "past_due" | "cancelled";
  subscription_ends_at?: string | null;
  sidecar_token?: string;
}

// useRedeemInstallerBootstrap swaps the one-time installer code for a full
// session. The sidecar proxies the call to cloud, persists sk_live_* in
// sync_state, caches credentials for offline login, and resigns the JWTs
// with the local secret so subsequent sidecar requests validate.
export function useRedeemInstallerBootstrap() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: async (input: { token: string }) => {
      const data = await api.post<RedeemInstallerResponse>(
        "/api/v1/auth/redeem-installer",
        input,
        { skipAuth: true, retry: 0 }
      );
      await setTokens(data.access_token, data.refresh_token);
      setSession(
        {
          user_id: data.user_id,
          full_name: data.full_name,
          email: data.email,
          role: data.role,
        },
        {
          gym_id: data.gym_id,
          name: data.gym_name,
          setup_completed: data.setup_completed,
          trial_ends_at: data.trial_ends_at,
          subscription_plan: data.subscription_plan,
          subscription_status: data.subscription_status ?? "active",
          subscription_ends_at: data.subscription_ends_at ?? null,
        }
      );
      return data;
    },
  });
}

export function useSignup() {
  const setSession = useAuthStore((s) => s.setSession);

  return useMutation({
    mutationFn: async (input: {
      full_name: string;
      email: string;
      password: string;
    }) => {
      const data = await api.post<SignupResponse>(
        "/api/v1/auth/signup",
        { ...input, password_confirm: input.password },
        { skipAuth: true }
      );
      await setTokens(data.access_token, data.refresh_token);
      setSession(
        {
          user_id: data.user_id,
          full_name: input.full_name,
          email: input.email,
          role: "owner",
        },
        {
          gym_id: data.gym_id,
          name: null,
          setup_completed: false,
          trial_ends_at: null,
          subscription_plan: "trial",
          subscription_status: "active",
          subscription_ends_at: null,
        }
      );
      return data;
    },
  });
}

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (input: { email: string }) =>
      api.post("/api/v1/auth/forgot-password", input, { skipAuth: true }),
  });
}

export function useConfirmPasswordReset() {
  return useMutation({
    mutationFn: (input: { token: string; new_password: string }) =>
      api.post("/api/v1/auth/reset-password", input, { skipAuth: true }),
  });
}

interface MeResponse {
  user: AuthUser;
  gym: AuthGym;
}

export interface UpdateMeInput {
  full_name?: string;
  phone?: string | null;
}

// useUpdateMe lets the current user edit their own display profile
// (full_name + phone). Hits PATCH /auth/me — works for any role, unlike
// /users/:id which is owner-only. Returns the updated user wire shape.
export function useUpdateMe() {
  const setSession = useAuthStore((s) => s.setSession);
  const gym = useAuthStore((s) => s.gym);

  return useMutation({
    mutationFn: async (input: UpdateMeInput) => {
      return api.patch<AuthUser>("/api/v1/auth/me", input);
    },
    onSuccess: (updated) => {
      if (gym) setSession(updated, gym);
    },
  });
}

export function useHydrateAuth() {
  const setSession = useAuthStore((s) => s.setSession);
  const markHydrated = useAuthStore((s) => s.markHydrated);

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      if (!token) {
        markHydrated();
        return;
      }
      try {
        const me = await api.get<MeResponse>("/api/v1/auth/me");
        setSession(me.user, me.gym);
      } catch {
        // /auth/me failed — sidecar might be booting, JWT_SECRET might
        // have rotated, network might be flaky. None of these justify
        // logging the operator out. Keep the tokens; the next user
        // action will retry. The route guards still see no session
        // until /me succeeds, so we don't show stale data either.
      } finally {
        markHydrated();
      }
    })();
  }, [markHydrated, setSession]);
}
