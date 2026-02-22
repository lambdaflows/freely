import { PluelyApiSetup } from "./components";
import { PageLayout } from "@/layouts";

const Dashboard = () => {
  return (
    <PageLayout
      title="Dashboard"
      description="Configure your Freely API settings and manage your license."
    >
      {/* Freely API Setup */}
      <PluelyApiSetup />
    </PageLayout>
  );
};

export default Dashboard;
