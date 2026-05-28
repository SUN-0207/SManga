'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table';

export interface JobRow {
  id: string;
  name: string;
  state: string;
  retryCount: number;
  createdOn: string;
  output: unknown;
}

export function JobsTable({ jobs }: { jobs: JobRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function retry(id: string) {
    setBusy(id);
    await fetch(`/api/admin/jobs/${id}/retry`, { method: 'POST' });
    setBusy(null);
    router.refresh();
  }

  const variant: Record<string, 'default' | 'success' | 'destructive' | 'secondary'> = {
    completed: 'success',
    created: 'secondary',
    active: 'default',
    failed: 'destructive',
    cancelled: 'secondary',
  };

  return (
    <Table>
      <Thead>
        <Tr>
          <Th className="w-40">Job</Th><Th>State</Th><Th>Retries</Th><Th>Tạo</Th>
          <Th>Output / error</Th><Th></Th>
        </Tr>
      </Thead>
      <Tbody>
        {jobs.map((j) => (
          <Tr key={j.id}>
            <Td className="font-mono text-xs">{j.name}</Td>
            <Td><Badge variant={variant[j.state] ?? 'secondary'}>{j.state}</Badge></Td>
            <Td>{j.retryCount}</Td>
            <Td className="text-xs">{new Date(j.createdOn).toLocaleString('vi-VN')}</Td>
            <Td className="text-xs max-w-md truncate">{j.output ? JSON.stringify(j.output) : ''}</Td>
            <Td>
              {(j.state === 'failed' || j.state === 'cancelled') && (
                <Button size="sm" variant="outline" onClick={() => retry(j.id)} disabled={busy === j.id}>
                  Retry
                </Button>
              )}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
