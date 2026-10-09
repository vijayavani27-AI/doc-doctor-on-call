import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useApp } from "./lib/store";
import { AppLayout } from "./components/Layout";
import { Spinner } from "./components/ui";
import Landing from "./pages/Landing";
import { Login, Register } from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import UploadPage from "./pages/Upload";
import Records from "./pages/Records";
import ReviewPage from "./pages/Review";
import Timeline from "./pages/Timeline";
import Risks from "./pages/Risks";
import Medicines from "./pages/Medicines";
import Chat from "./pages/Chat";
import Doctor from "./pages/Doctor";
import SettingsPage from "./pages/Settings";
import SharedSummary from "./pages/Shared";
import Guide from "./pages/Guide";
import Wellness from "./pages/Wellness";
import DemoEntry from "./pages/DemoEntry";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Legal from "./pages/Legal";
import NotFound from "./pages/NotFound";
import Family from "./pages/Family";
import CarePlan from "./pages/CarePlan";
import Screening from "./pages/Screening";
import Emergency from "./pages/Emergency";
import Meals from "./pages/Meals";
import WoundCheck from "./pages/WoundCheck";
import Remedies from "./pages/Remedies";

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useApp();
  const loc = useLocation();
  if (loading) return <div className="min-h-dvh grid place-items-center"><Spinner /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/share/:token" element={<SharedSummary />} />
      <Route path="/demo" element={<DemoEntry />} />
      <Route path="/about" element={<About />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/legal" element={<Legal />} />
      <Route path="/app" element={<Protected><AppLayout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="upload" element={<UploadPage />} />
        <Route path="records" element={<Records />} />
        <Route path="records/:id" element={<ReviewPage />} />
        <Route path="timeline" element={<Timeline />} />
        <Route path="risks" element={<Risks />} />
        <Route path="medicines" element={<Medicines />} />
        <Route path="chat" element={<Chat />} />
        <Route path="doctor" element={<Doctor />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="guide" element={<Guide />} />
        <Route path="wellness" element={<Wellness />} />
        <Route path="family" element={<Family />} />
        <Route path="care" element={<CarePlan />} />
        <Route path="screening" element={<Screening />} />
        <Route path="emergency" element={<Emergency />} />
        <Route path="meals" element={<Meals />} />
        <Route path="wound" element={<WoundCheck />} />
        <Route path="remedies" element={<Remedies />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
