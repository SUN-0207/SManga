export default function HomePage() {
  return (
    <main className="container py-12">
      <h1 className="text-3xl font-bold">SManga</h1>
      <p className="text-muted-foreground mt-2">Reader UI is shipped in Plan 3.</p>
      <p className="mt-4">
        Admin: <a className="underline" href="/admin">/admin</a>
      </p>
    </main>
  );
}
