export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="skeleton mb-3 h-14 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="skeleton h-[74px] rounded-xl" />
        ))}
      </div>
      <div className="skeleton mt-3 h-64 w-full rounded-xl" />
      <p className="muted mt-3 text-center text-[12.5px]">Loading…</p>
    </div>
  );
}
