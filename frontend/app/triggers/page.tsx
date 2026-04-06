import dynamic from "next/dynamic";

const TriggerBuilderClient = dynamic(() => import("./TriggerBuilderClient"), {
  ssr: false,
  loading: () => <div className="page-shell"><div className="skeleton" style={{ height: "34rem" }} /></div>,
});

export default function TriggerBuilderPage() {
  return <TriggerBuilderClient />;
}
