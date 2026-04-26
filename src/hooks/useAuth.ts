import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api, clearTokens, getAccessToken, setTokens } from "@/lib/api";
import { useAuthStore, type AuthGym, type AuthUser } from "@/stores/useAuthStore";
import { queryClient } from "@/lib/queryClient";

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

export function useSignup() {
  const setSession = useAuthStore((s) => s.setSession);

  return useMutation({
    mutationFn: async (input: {
      full_name: string;
      email: string;
      password: string;
    }) => {
      const data = await api.post<SignupResponse>("/api/v1/auth/signup", input, { skipAuth: true });
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
        await clearTokens();
      } finally {
        markHydrated();
      }
    })();
  }, [markHydrated, setSession]);
}
