import { Navigate, useLocation } from "react-router-dom";
import { legacyAttentionDestination } from "@/lib/memberNavigation";

export default function AttentionRequiredPage() {
  const { search, hash } = useLocation();
  const target = legacyAttentionDestination(search, hash);
  return <Navigate replace to={target} />;
}
