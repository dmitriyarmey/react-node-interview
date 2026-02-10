import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type UserRole = "user" | "admin";

export type AuthUser = {
  id: string;
  name: string;
  role: UserRole;
};

type AuthContextValue = {
  currentUser: AuthUser;
  setRole: (role: UserRole) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole>("user");

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser: {
        id: "u3",
        name: "Jordan Smith",
        role,
      },
      setRole,
    }),
    [role]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
