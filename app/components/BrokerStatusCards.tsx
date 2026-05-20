import type { BrokerStatus } from "../types";

type BrokerStatusCardsProps = {
  brokers: BrokerStatus[];
};

export function BrokerStatusCards({ brokers }: BrokerStatusCardsProps) {
  return (
    <section className="grid gap-4 md:grid-cols-3" aria-label="Broker status">
      {brokers.map((broker) => (
        <article
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          key={broker.name}
        >
          <p className="text-sm font-medium text-slate-500">{broker.name}</p>
          <h2 className="mt-2 text-xl font-semibold">{broker.status}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {broker.detail}
          </p>
        </article>
      ))}
    </section>
  );
}
