export default function Loading() {
  return (
    <div className="flex items-center gap-3 p-8 text-sm text-gray-400">
      <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-accent" />
      Daten werden von den Quellen geladen…
    </div>
  );
}
