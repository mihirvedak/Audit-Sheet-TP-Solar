import DashboardClient from "@/components/DashboardClient";
import { cards } from "@/lib/dashboardData";

export default function Home() {
  return <DashboardClient cards={cards} />;
}
