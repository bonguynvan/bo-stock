import AppRouter from "@/components/AppRouter";
import AuthGuard from "@/components/AuthGuard";

export default function AppPage() {
  return (
    <AuthGuard>
      <div className="h-screen flex flex-col overflow-hidden">
        <AppRouter />
      </div>
    </AuthGuard>
  );
}
