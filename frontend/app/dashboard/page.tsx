import dynamic from "next/dynamic";

const DashboardClient = dynamic(() => import("../page-home/HomeMapClient"), {
  ssr: false,
  loading: () => <div className="page-shell"><div className="skeleton" style={{ height: "28rem" }} /></div>,
});

export default function DashboardPage() {
  return <DashboardClient />;
}
