import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: () => (
    <div className="container py-12">
      <h1 className="text-3xl font-bold">SManga</h1>
      <p className="text-muted-foreground mt-2">Routes filled in at Task 11.</p>
    </div>
  ),
});
