import Dashboard from "@/components/dashboard";
import { getRates } from "@/lib/rates";

// Las tasas cambian durante el día: render en tiempo de solicitud.
export const dynamic = "force-dynamic";

export default async function Home() {
  const initialRates = await getRates();
  return <Dashboard initialRates={initialRates} />;
}
