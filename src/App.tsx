import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import Home from "./pages/Home";
import Auth from "./pages/Auth";
import Watch from "./pages/Watch";
import Dashboard from "./pages/Dashboard";
import Upload from "./pages/Upload";
import Channel from "./pages/Channel";
import Profile from "./pages/Profile";
import Subscriptions from "./pages/Subscriptions";
import Admin from "./pages/Admin";
import Live from "./pages/Live";
import ProfileSetup from "./pages/ProfileSetup";
import PsaShorts from "./pages/PsaShorts";
import SearchResults from "./pages/SearchResults";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Redirect incomplete profiles to /setup before accessing protected routes
function SetupGate({ children }: { children: React.ReactNode }) {
  const { needsProfileSetup, loading } = useAuth();
  if (loading) return null;
  if (needsProfileSetup) return <Navigate to="/setup" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              {/* Public */}
              <Route path="/" element={<Home />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/watch/:id" element={<Watch />} />
              <Route path="/channel/:id" element={<Channel />} />
              <Route path="/live/:sessionId" element={<Live />} />
              <Route path="/search" element={<SearchResults />} />
              <Route path="/channel/:channelId/shorts" element={<PsaShorts />} />

              {/* Profile setup — accessible to logged-in users with incomplete profiles */}
              <Route path="/setup" element={<ProtectedRoute><ProfileSetup /></ProtectedRoute>} />

              {/* Protected — require complete profile */}
              <Route path="/dashboard" element={<ProtectedRoute><SetupGate><Dashboard /></SetupGate></ProtectedRoute>} />
              <Route path="/upload" element={<ProtectedRoute><SetupGate><Upload /></SetupGate></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><SetupGate><Profile /></SetupGate></ProtectedRoute>} />
              <Route path="/subscriptions" element={<ProtectedRoute><SetupGate><Subscriptions /></SetupGate></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute><SetupGate><Admin /></SetupGate></ProtectedRoute>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
