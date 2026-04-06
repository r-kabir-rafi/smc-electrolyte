import { FlaskIcon } from "../../components/icons";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";

export default function ExperimentsPage() {
  return (
    <main className="page-shell">
      <div className="page-header">
        <div>
          <div className="page-kicker">Sandbox</div>
          <h1 className="page-title">Experiments</h1>
          <p className="page-subtitle">
            Prototype surfaces for alternate models, uplift simulations, and evaluation reports live here.
          </p>
        </div>
      </div>

      <div className="grid-span-12">
        <EmptyState
          icon={<FlaskIcon width={28} height={28} />}
          title="No experiments are published yet"
          description="This area is reserved for future scenario analysis and experiment readouts."
          action={<Button variant="secondary" type="button">Check Data Freshness</Button>}
        />
      </div>
    </main>
  );
}
