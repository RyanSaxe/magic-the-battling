import type { ReactNode } from "react";
import { useAuthSession } from "../hooks/pages/useAuthSession";
import { AuthContext } from "./authState";

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useAuthSession();

  return (
    <AuthContext.Provider value={session}>{children}</AuthContext.Provider>
  );
}
