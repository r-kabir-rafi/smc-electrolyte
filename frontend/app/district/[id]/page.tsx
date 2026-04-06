import dynamic from "next/dynamic";

const DistrictDetailClient = dynamic(() => import("./DistrictDetailClient"), {
  ssr: false,
  loading: () => <div className="page-shell"><div className="skeleton" style={{ height: "34rem" }} /></div>,
});

export default function DistrictDetailPage({ params }: { params: { id: string } }) {
  return <DistrictDetailClient districtSlug={params.id} />;
}
