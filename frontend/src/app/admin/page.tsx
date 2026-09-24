import AdminView from "@/components/AdminView";
import AuthGuard from "@/components/AuthGuard";

export default function AdminPage() {
  return (
    <AuthGuard>
      <AdminView />
    </AuthGuard>
  );
}
